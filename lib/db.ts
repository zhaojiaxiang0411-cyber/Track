import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";

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
      esxi_check INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS step_instances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pair_id INTEGER NOT NULL,
      step_order INTEGER NOT NULL,
      action_key TEXT NOT NULL,
      team TEXT NOT NULL CHECK (team IN ('A', 'B', 'C')),
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
    migrateMergeLabelAndUnplug(database);
    migrateAddEsxiCheckColumn(database);
    migrateAllowTeamC(database);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

// 一次性迁移：放宽 step_instances 的 team 约束到 ('A','B','C')，以容纳
// Team C（esxi）的 Esxi Check 步骤。SQLite 无法 ALTER 修改 CHECK，只能重建表：
// 建新表 → 全量复制 → 删旧表 → 改名 → 重建索引。
// 列结构与数据均不变，仅放宽约束；本函数运行在 initSchema 的迁移事务内，
// 任一步失败会整体 ROLLBACK。用 user_version 保证只执行一次，
// 并对「新库建表时已含 C」的情况直接跳过重建。
function migrateAllowTeamC(database: DatabaseSync) {
  const TARGET_VERSION = 6;
  const row = database.prepare("PRAGMA user_version").get() as
    | { user_version: number }
    | undefined;
  const current = row?.user_version ?? 0;
  if (current >= TARGET_VERSION) return;

  const schema = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get("step_instances") as { sql?: string } | undefined;
  const alreadyAllowsC = (schema?.sql ?? "").includes("'C'");

  if (!alreadyAllowsC) {
    database.exec(`
      CREATE TABLE step_instances_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pair_id INTEGER NOT NULL,
        step_order INTEGER NOT NULL,
        action_key TEXT NOT NULL,
        team TEXT NOT NULL CHECK (team IN ('A', 'B', 'C')),
        label TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        duration_sec INTEGER,
        FOREIGN KEY (pair_id) REFERENCES pairs(id) ON DELETE CASCADE,
        UNIQUE (pair_id, step_order)
      );

      INSERT INTO step_instances_new
        (id, pair_id, step_order, action_key, team, label, started_at, completed_at, duration_sec)
      SELECT
        id, pair_id, step_order, action_key, team, label, started_at, completed_at, duration_sec
      FROM step_instances;

      DROP TABLE step_instances;

      ALTER TABLE step_instances_new RENAME TO step_instances;

      CREATE INDEX IF NOT EXISTS idx_step_instances_pair_id ON step_instances(pair_id);
    `);
  }

  database.exec(`PRAGMA user_version = ${TARGET_VERSION}`);
}

// 按需为 pairs 增加 esxi_check 列（是否包含 Esxi Check 步骤）。
// 历史 pair 一律为 0，保持原有 14 步布局不受影响。
function migrateAddEsxiCheckColumn(database: DatabaseSync) {
  const columns = database
    .prepare("PRAGMA table_info(pairs)")
    .all() as Array<{ name: string }>;
  if (!columns.some((col) => col.name === "esxi_check")) {
    database.exec(
      "ALTER TABLE pairs ADD COLUMN esxi_check INTEGER NOT NULL DEFAULT 0"
    );
  }
}

// 一次性迁移：把 Label 与 Unplug Downlinks 合并为一步（仍归 B 组），
// 流水线由 16 步变为 14 步（SW1 合并步 = 3、SW2 合并步 = 9）。
// 合并语义：合并步的 started_at 取原 Label 的开始时刻，completed_at 取原 Unplug 的完成时刻，
// duration 按两者重算；若原 Unplug 未完成，则合并步整体视为未完成（两步都做完才算完成），
// 由 B 组重新点一次，避免把「只贴了标签、还没拔线」的流程当作已完成。
// 本迁移同时按 LEGACY_LAYOUT_V5 快照重排全部 step_order，
// 因此取代了原 migrateNormalizeStepOrder（user_version 4）的归一修复。
// 用 user_version 保证只执行一次。
function migrateMergeLabelAndUnplug(database: DatabaseSync) {
  const TARGET_VERSION = 5;
  const row = database.prepare("PRAGMA user_version").get() as
    | { user_version: number }
    | undefined;
  const current = row?.user_version ?? 0;
  if (current >= TARGET_VERSION) return;

  // 1) 把同 phase 的 Unplug 时间并入 Label 行。
  //    仅在该 pair 确有 Unplug 行时更新，避免把没有 Unplug 可合并的 Label 完成状态抹掉。
  const mergeTimes = database.prepare(`
    UPDATE step_instances
    SET
      started_at = COALESCE(
        started_at,
        (SELECT u.started_at FROM step_instances u
          WHERE u.pair_id = step_instances.pair_id AND u.action_key = ?)
      ),
      completed_at = (
        SELECT u.completed_at FROM step_instances u
          WHERE u.pair_id = step_instances.pair_id AND u.action_key = ?
      ),
      duration_sec = NULL
    WHERE action_key = ?
      AND EXISTS (
        SELECT 1 FROM step_instances u
        WHERE u.pair_id = step_instances.pair_id AND u.action_key = ?
      );
  `);
  mergeTimes.run(
    "unplug_downlink_sw1",
    "unplug_downlink_sw1",
    "label_sw1",
    "unplug_downlink_sw1"
  );
  mergeTimes.run(
    "unplug_downlink_sw2",
    "unplug_downlink_sw2",
    "label_sw2",
    "unplug_downlink_sw2"
  );

  // 2) 重算合并步耗时。时间为本地时间字符串，strftime 按 UTC 解析但两端一致，差值不受影响。
  database.exec(`
    UPDATE step_instances
    SET duration_sec = MAX(
      0,
      CAST(strftime('%s', completed_at) - strftime('%s', started_at) AS INTEGER)
    )
    WHERE action_key IN ('label_sw1', 'label_sw2')
      AND started_at IS NOT NULL
      AND completed_at IS NOT NULL;
  `);

  // 3) 删除已被合并的 Unplug 步骤，并统一合并步文案。
  //    这里必须再刷一次 label：label_sw2 是由 migrateAddLabelSw2 在 migrateStepLabels
  //    之后才插入的，其 label 列仍是旧文案 'Label'。
  database.exec(`
    DELETE FROM step_instances
    WHERE action_key IN ('unplug_downlink_sw1', 'unplug_downlink_sw2');

    UPDATE step_instances
    SET label = 'Label and Unplug Downlinks'
    WHERE action_key IN ('label_sw1', 'label_sw2');
  `);

  // 4) 按 v5 布局快照重排 step_order。先落到不可能与现有数据冲突的临时负值（-1001 起），
  //    再落到权威正值，规避 UNIQUE(pair_id, step_order) 冲突；
  //    历史遗留的 -1..-16 负值也会在此被修正。
  const toTemp = database.prepare(
    "UPDATE step_instances SET step_order = ? WHERE action_key = ?"
  );
  const toFinal = database.prepare(
    "UPDATE step_instances SET step_order = ? WHERE action_key = ?"
  );
  for (const [actionKey, order] of LEGACY_LAYOUT_V5) {
    toTemp.run(-(1000 + order), actionKey);
  }
  for (const [actionKey, order] of LEGACY_LAYOUT_V5) {
    toFinal.run(order, actionKey);
  }

  database.exec(`PRAGMA user_version = ${TARGET_VERSION}`);
}

// v5 迁移当时的权威布局快照（14 步，无可选步骤）。
// 历史迁移必须钉死在「当时」的布局上，不能引用 pipeline.ts 的现行布局，
// 否则今后调整流水线会反过来篡改这次迁移的语义。
const LEGACY_LAYOUT_V5: Array<[string, number]> = [
  ["mw_start", 1],
  ["snapshot_sw1", 2],
  ["label_sw1", 3],
  ["decomm_sw1", 4],
  ["uplink_only_sw1", 5],
  ["commission_sw1", 6],
  ["downlink_sw1", 7],
  ["post_check_sw1", 8],
  ["label_sw2", 9],
  ["decomm_sw2", 10],
  ["uplink_only_sw2", 11],
  ["commission_sw2", 12],
  ["downlink_sw2", 13],
  ["post_check_sw2", 14],
];

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

    UPDATE step_instances
    SET label = 'Label and Unplug Downlinks'
    WHERE action_key IN ('label_sw1', 'label_sw2')
      AND label = 'Label';
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
