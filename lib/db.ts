import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import { PIPELINE_STEPS } from "./pipeline";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "track.db");

let db: DatabaseSync | null = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function initSchema(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS pairs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      switch1 TEXT NOT NULL,
      switch2 TEXT NOT NULL,
      rack TEXT,
      footprint TEXT,
      owner TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS step_instances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pair_id INTEGER NOT NULL,
      step_order INTEGER NOT NULL,
      action_key TEXT NOT NULL,
      team TEXT NOT NULL CHECK (team IN ('A', 'B')),
      label TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      duration_sec INTEGER,
      FOREIGN KEY (pair_id) REFERENCES pairs(id) ON DELETE CASCADE,
      UNIQUE (pair_id, step_order)
    );

    CREATE INDEX IF NOT EXISTS idx_step_instances_pair_id ON step_instances(pair_id);
  `);
  // 迁移整体包进事务：任何一步抛错都整体回滚，避免留下「半迁移」脏数据
  // （如 step_order 被改成负值却未落回正值，导致步骤顺序错乱）。
  database.exec("BEGIN");
  try {
    migrateAddOwnerColumn(database);
    migrateAddRackFootprintColumns(database);
    migrateStepLabels(database);
    migrateRemoveCheckFaultSteps(database);
    migrateShiftLegacyUtcTimestamps(database);
    migrateAddLabelSw2(database);
    migrateAddUnplugDownlinks(database);
    migrateNormalizeStepOrder(database);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

// 一次性修复：把每个步骤的 step_order 按 action_key 归一到 pipeline.ts 的权威布局。
// 历史上 migrateRemoveCheckFaultSteps 缺少守护、每次启动重排，与 unplug 迁移冲突后
// 会留下负值 / 乱序的 step_order。这里按权威映射重置，修复已损坏数据；
// 因是幂等的双段「先取负、再落值」重排，对已正确的数据无副作用。
// 用 user_version 保证只执行一次。
function migrateNormalizeStepOrder(database: DatabaseSync) {
  const TARGET_VERSION = 4;
  const row = database.prepare("PRAGMA user_version").get() as
    | { user_version: number }
    | undefined;
  const current = row?.user_version ?? 0;
  if (current >= TARGET_VERSION) return;

  const toTemp = database.prepare(
    "UPDATE step_instances SET step_order = ? WHERE action_key = ?"
  );
  const toFinal = database.prepare(
    "UPDATE step_instances SET step_order = ? WHERE action_key = ?"
  );
  // 先把每个 action_key 落到唯一的临时负值（-order），避免与现有值撞 UNIQUE(pair_id, step_order)；
  // 再落到权威正值。临时值 -1..-16 各不相同，且与目标正值不重叠，故两段均无冲突。
  for (const step of PIPELINE_STEPS) toTemp.run(-step.order, step.actionKey);
  for (const step of PIPELINE_STEPS) toFinal.run(step.order, step.actionKey);

  database.exec(`PRAGMA user_version = ${TARGET_VERSION}`);
}

// 一次性迁移：在 Label 与 Decommission 之间，为 SW1、SW2 各插入一个
// Unplug Downlinks（拔下联）步骤，归属 B 组。插入后原有步骤顺移：
//   SW1: decomm 4→5、uplink 5→6、commission 6→7、downlink 7→8、post_check 8→9
//   SW2: label 9→10、decomm 10→12、uplink 11→13、commission 12→14、downlink 13→15、post_check 14→16
// 新步骤落在 SW1=4、SW2=11。
// 对已完成同 phase Decommission 的历史 pair，直接把补入的 Unplug 标记为已完成
// （时间取 Decommission 的开始时刻，duration=0），避免把已推进/结束的流程重新置为待办；
// 其余 pair 则保留为待办，由 B 组执行。
// 用 user_version 保证只执行一次。
function migrateAddUnplugDownlinks(database: DatabaseSync) {
  const TARGET_VERSION = 3;
  const row = database.prepare("PRAGMA user_version").get() as
    | { user_version: number }
    | undefined;
  const current = row?.user_version ?? 0;
  if (current >= TARGET_VERSION) return;

  // 1) 顺移受影响步骤的 step_order。先取负避免与 UNIQUE(pair_id, step_order) 冲突，再落到目标值。
  const reorder: Array<[string, number]> = [
    ["decomm_sw1", 5],
    ["uplink_only_sw1", 6],
    ["commission_sw1", 7],
    ["downlink_sw1", 8],
    ["post_check_sw1", 9],
    ["label_sw2", 10],
    ["decomm_sw2", 12],
    ["uplink_only_sw2", 13],
    ["commission_sw2", 14],
    ["downlink_sw2", 15],
    ["post_check_sw2", 16],
  ];
  const toTemp = database.prepare(
    "UPDATE step_instances SET step_order = -step_order WHERE action_key = ?"
  );
  const toFinal = database.prepare(
    "UPDATE step_instances SET step_order = ? WHERE action_key = ?"
  );
  for (const [actionKey] of reorder) toTemp.run(actionKey);
  for (const [actionKey, order] of reorder) toFinal.run(order, actionKey);

  // 2) 为每个 pair 插入 Unplug Downlinks，参照同 phase 的 Decommission 完成情况决定是否直接标记完成。
  const insertUnplug = database.prepare(`
    INSERT INTO step_instances
      (pair_id, step_order, action_key, team, label, started_at, completed_at, duration_sec)
    SELECT
      d.pair_id, ?, ?, 'B', 'Unplug Downlinks',
      CASE WHEN d.completed_at IS NOT NULL THEN COALESCE(d.started_at, d.completed_at) ELSE NULL END,
      CASE WHEN d.completed_at IS NOT NULL THEN COALESCE(d.started_at, d.completed_at) ELSE NULL END,
      CASE WHEN d.completed_at IS NOT NULL THEN 0 ELSE NULL END
    FROM step_instances d
    WHERE d.action_key = ?
      AND NOT EXISTS (
        SELECT 1 FROM step_instances u
        WHERE u.pair_id = d.pair_id AND u.action_key = ?
      );
  `);
  insertUnplug.run(4, "unplug_downlink_sw1", "decomm_sw1", "unplug_downlink_sw1");
  insertUnplug.run(11, "unplug_downlink_sw2", "decomm_sw2", "unplug_downlink_sw2");

  database.exec(`PRAGMA user_version = ${TARGET_VERSION}`);
}

// 一次性迁移：为 SW2 在 Decommission 之前补一个 Label 步骤（与 SW1 对称）。
// SW2 后续步骤已在 migrateRemoveCheckFaultSteps 中顺移到 10-14，step_order = 9 已空出。
// 对于 SW2 已 Decommission 的历史 pair，将补入的 Label 直接标记为已完成，
// 以免把已结束的流程重新置为待办；其余 pair 则保留为待办，由 B 组执行。
// 用 user_version 保证只执行一次。
function migrateAddLabelSw2(database: DatabaseSync) {
  const TARGET_VERSION = 2;
  const row = database.prepare("PRAGMA user_version").get() as
    | { user_version: number }
    | undefined;
  const current = row?.user_version ?? 0;
  if (current >= TARGET_VERSION) return;

  database.exec(`
    INSERT INTO step_instances
      (pair_id, step_order, action_key, team, label, started_at, completed_at, duration_sec)
    SELECT
      d.pair_id, 9, 'label_sw2', 'B', 'Label',
      CASE WHEN d.completed_at IS NOT NULL THEN COALESCE(d.started_at, d.completed_at) ELSE NULL END,
      CASE WHEN d.completed_at IS NOT NULL THEN COALESCE(d.started_at, d.completed_at) ELSE NULL END,
      CASE WHEN d.completed_at IS NOT NULL THEN 0 ELSE NULL END
    FROM step_instances d
    WHERE d.action_key = 'decomm_sw2'
      AND NOT EXISTS (
        SELECT 1 FROM step_instances l
        WHERE l.pair_id = d.pair_id AND l.action_key = 'label_sw2'
      );
  `);

  database.exec(`PRAGMA user_version = ${TARGET_VERSION}`);
}

// 一次性迁移：早期版本把时间以 UTC 存入（datetime('now') / toISOString()），
// 显示端却按本地时间解析，导致旧数据偏早 8 小时。这里将已有旧数据 +8 小时
// 校正到本地时区（东八区）。用 user_version 保证只执行一次，
// 不会影响修复后按本地时间写入的新数据。
function migrateShiftLegacyUtcTimestamps(database: DatabaseSync) {
  const TARGET_VERSION = 1;
  const row = database.prepare("PRAGMA user_version").get() as
    | { user_version: number }
    | undefined;
  const current = row?.user_version ?? 0;
  if (current >= TARGET_VERSION) return;

  database.exec(`
    UPDATE pairs
    SET created_at = datetime(created_at, '+8 hours')
    WHERE created_at IS NOT NULL;

    UPDATE step_instances
    SET started_at = datetime(started_at, '+8 hours')
    WHERE started_at IS NOT NULL;

    UPDATE step_instances
    SET completed_at = datetime(completed_at, '+8 hours')
    WHERE completed_at IS NOT NULL;
  `);

  database.exec(`PRAGMA user_version = ${TARGET_VERSION}`);
}

function migrateAddOwnerColumn(database: DatabaseSync) {
  const columns = database
    .prepare("PRAGMA table_info(pairs)")
    .all() as Array<{ name: string }>;
  const hasOwner = columns.some((col) => col.name === "owner");
  if (!hasOwner) {
    database.exec("ALTER TABLE pairs ADD COLUMN owner TEXT");
  }
}

function migrateAddRackFootprintColumns(database: DatabaseSync) {
  const columns = database
    .prepare("PRAGMA table_info(pairs)")
    .all() as Array<{ name: string }>;
  if (!columns.some((col) => col.name === "rack")) {
    database.exec("ALTER TABLE pairs ADD COLUMN rack TEXT");
  }
  if (!columns.some((col) => col.name === "footprint")) {
    database.exec("ALTER TABLE pairs ADD COLUMN footprint TEXT");
  }
}

function migrateStepLabels(database: DatabaseSync) {
  database.exec(`
    UPDATE step_instances
    SET label = 'Decommission'
    WHERE action_key IN ('decomm_sw1', 'decomm_sw2')
      AND label IN ('Decomm', 'Decomission');

    UPDATE step_instances
    SET label = 'Rack and Plugin Uplinks'
    WHERE action_key IN ('uplink_only_sw1', 'uplink_only_sw2')
      AND label IN ('消失后拔线，仅插上联 LED', 'Mount and Plugin Uplinks');

    UPDATE step_instances
    SET label = 'Register'
    WHERE action_key IN ('commission_sw1', 'commission_sw2')
      AND label IN ('发现后 Commission', '发现后 Register');

    UPDATE step_instances
    SET label = 'Plugin Downlinks'
    WHERE action_key IN ('downlink_sw1', 'downlink_sw2')
      AND label = 'Plug in Downlink';
  `);
}

function migrateRemoveCheckFaultSteps(database: DatabaseSync) {
  // 这套「删除 check_fault + 顺移 SW2」的重排只在确实存在旧步骤时才有意义。
  // 若无守护，它会在每次进程首次连接 DB 时无条件重排，把布局强行改回旧的 14 步，
  // 与后续 migrateAddUnplugDownlinks 的新布局冲突（step_order 撞 UNIQUE 约束），
  // 中途抛错还会留下负值 step_order，导致步骤顺序错乱。故此处先判存在再执行。
  const hasLegacy = database
    .prepare(
      "SELECT 1 FROM step_instances WHERE action_key IN ('check_fault_sw1', 'check_fault_sw2') LIMIT 1"
    )
    .get();
  if (!hasLegacy) return;

  database.exec(`
    DELETE FROM step_instances
    WHERE action_key IN ('check_fault_sw1', 'check_fault_sw2');
  `);

  const reorder: Array<[string, number]> = [
    ["post_check_sw1", 8],
    ["label_sw2", 9],
    ["decomm_sw2", 10],
    ["uplink_only_sw2", 11],
    ["commission_sw2", 12],
    ["downlink_sw2", 13],
    ["post_check_sw2", 14],
  ];

  const toTemp = database.prepare(
    "UPDATE step_instances SET step_order = -step_order WHERE action_key = ?"
  );
  const toFinal = database.prepare(
    "UPDATE step_instances SET step_order = ? WHERE action_key = ?"
  );

  for (const [actionKey] of reorder) {
    toTemp.run(actionKey);
  }
  for (const [actionKey, order] of reorder) {
    toFinal.run(order, actionKey);
  }
}

export function getDb(): DatabaseSync {
  if (!db) {
    ensureDataDir();
    db = new DatabaseSync(DB_PATH);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    initSchema(db);
  }
  return db;
}

export function runTransaction<T>(fn: () => T): T {
  const database = getDb();
  database.exec("BEGIN");
  try {
    const result = fn();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
