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
      owner TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
      operating INTEGER NOT NULL DEFAULT 0,
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
  migrateAddOwnerColumn(database);
  migrateAddOperatingColumn(database);
  migrateStepLabels(database);
  migrateRemoveCheckFaultSteps(database);
  migrateAddSw2Label(database);
  migrateShiftLegacyUtcTimestamps(database);
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

function migrateAddOperatingColumn(database: DatabaseSync) {
  const columns = database
    .prepare("PRAGMA table_info(pairs)")
    .all() as Array<{ name: string }>;
  const hasOperating = columns.some((col) => col.name === "operating");
  if (!hasOperating) {
    database.exec(
      "ALTER TABLE pairs ADD COLUMN operating INTEGER NOT NULL DEFAULT 0"
    );
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
  database.exec(`
    DELETE FROM step_instances
    WHERE action_key IN ('check_fault_sw1', 'check_fault_sw2');
  `);

  // 目标序号对应 14 步新布局：SW2 在 Decommission 前新增 label_sw2(order 9)，
  // 其余 SW2 步骤整体后移。label_sw2 本身的插入见 migrateAddSw2Label。
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

// 幂等迁移：为已有 pair 在 SW2 阶段补插 Decommission 之前的 Label 步骤（order 9）。
// migrateRemoveCheckFaultSteps 已把原 SW2 步骤后移，order 9 此时为空位。
// 智能处理已存在数据：
//   - 尚未推进到 SW2（decomm_sw2 未开始）→ Label 置为待办（时间为空）；
//   - 已开始/已完成 SW2 Decommission → Label 自动标记为已完成，沿用 decomm 的开始时刻，
//     避免把已完成或进行中的流程重新打开为「未完成」。
// 通过 NOT EXISTS 守卫保证可重复执行而不重复插入。
function migrateAddSw2Label(database: DatabaseSync) {
  database.exec(`
    INSERT INTO step_instances
      (pair_id, step_order, action_key, team, label, started_at, completed_at, duration_sec)
    SELECT
      d.pair_id, 9, 'label_sw2', 'B', 'Label',
      d.started_at,
      CASE WHEN d.started_at IS NOT NULL THEN d.started_at ELSE NULL END,
      CASE WHEN d.started_at IS NOT NULL THEN 0 ELSE NULL END
    FROM step_instances d
    WHERE d.action_key = 'decomm_sw2'
      AND NOT EXISTS (
        SELECT 1 FROM step_instances l
        WHERE l.pair_id = d.pair_id AND l.action_key = 'label_sw2'
      );
  `);
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
