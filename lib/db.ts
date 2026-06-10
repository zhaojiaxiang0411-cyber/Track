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
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
  migrateStepLabels(database);
  migrateRemoveCheckFaultSteps(database);
}

function migrateStepLabels(database: DatabaseSync) {
  database.exec(`
    UPDATE step_instances
    SET label = 'Decommission'
    WHERE action_key IN ('decomm_sw1', 'decomm_sw2')
      AND label IN ('Decomm', 'Decomission');

    UPDATE step_instances
    SET label = 'Mount and Plugin Uplinks'
    WHERE action_key IN ('uplink_only_sw1', 'uplink_only_sw2')
      AND label = '消失后拔线，仅插上联 LED';

    UPDATE step_instances
    SET label = 'Register'
    WHERE action_key IN ('commission_sw1', 'commission_sw2')
      AND label IN ('发现后 Commission', '发现后 Register');
  `);
}

function migrateRemoveCheckFaultSteps(database: DatabaseSync) {
  database.exec(`
    DELETE FROM step_instances
    WHERE action_key IN ('check_fault_sw1', 'check_fault_sw2');
  `);

  const reorder: Array<[string, number]> = [
    ["post_check_sw1", 8],
    ["decomm_sw2", 9],
    ["uplink_only_sw2", 10],
    ["commission_sw2", 11],
    ["downlink_sw2", 12],
    ["post_check_sw2", 13],
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
