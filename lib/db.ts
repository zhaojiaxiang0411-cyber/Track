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
  migrateStepLabels(database);
  migrateRemoveCheckFaultSteps(database);
  migrateShiftLegacyUtcTimestamps(database);
  migrateAddLabelSw2(database);
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
