import { createRequire } from "node:module";
import crypto from "node:crypto";

const require = createRequire(import.meta.url);
// @ts-ignore
const { DatabaseSync } = require("node:sqlite");

const DB_PATH = process.env.DB_PATH || "/home/kriday/family-money-magic-test/data/budget.db";
const DEFAULT_PASSWORD = "SmartHome@2012";

let _db: any = null;

function getDB(): any {
  if (_db) return _db;
  _db = new DatabaseSync(DB_PATH);
  _db.exec(`CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  return _db;
}

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(`smartbudget::${password}`, "utf8").digest("hex");
}

export function loadDBValue(): string | null {
  const row = getDB().prepare("SELECT value FROM kv WHERE key = ?").get("db");
  return row ? row.value : null;
}
export function saveDBValue(json: string): void {
  getDB().prepare("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)").run("db", json);
}
export function getPasswordHash(): string {
  const db = getDB();
  const row = db.prepare("SELECT value FROM kv WHERE key = ?").get("password_hash");
  if (row) return row.value;
  const hash = hashPassword(DEFAULT_PASSWORD);
  db.prepare("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)").run("password_hash", hash);
  return hash;
}
export function verifyPasswordServer(password: string): boolean {
  return hashPassword(password) === getPasswordHash();
}
export function changePasswordServer(current: string, next: string): boolean {
  if (hashPassword(current) !== getPasswordHash()) return false;
  getDB().prepare("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)").run("password_hash", hashPassword(next));
  return true;
}
