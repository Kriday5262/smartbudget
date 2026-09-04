import { createRequire } from "node:module";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";

const require = createRequire(import.meta.url);
// @ts-ignore
const { DatabaseSync } = require("node:sqlite");

const DATA_DIR =
  process.env.DATA_DIR ||
  (process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : "/home/kriday/smartbudget/data");
const DEFAULT_DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "budget.db");
const HOUSE_DIR = path.join(DATA_DIR, "houses");
const DEFAULT_PASSWORD = "SmartHome@2012";

const _dbConnections: Record<string, any> = {};

function getHomeDBPath(homeId = "default"): string {
  const cleanId = (homeId || "default").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!cleanId || cleanId === "default" || cleanId === "home-default") {
    return DEFAULT_DB_PATH;
  }
  return path.join(HOUSE_DIR, `home_${cleanId}.db`);
}

function getDB(homeId = "default"): any {
  const dbPath = getHomeDBPath(homeId);
  if (_dbConnections[dbPath]) return _dbConnections[dbPath];

  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const conn = new DatabaseSync(dbPath);
  conn.exec(`CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  _dbConnections[dbPath] = conn;
  return conn;
}

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(`smartbudget::${password}`, "utf8").digest("hex");
}

export function loadDBValue(homeId = "default"): string | null {
  const row = getDB(homeId).prepare("SELECT value FROM kv WHERE key = ?").get("db");
  return row ? row.value : null;
}

export function saveDBValue(json: string, homeId = "default"): void {
  getDB(homeId).prepare("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)").run("db", json);
}

export function getPasswordHash(homeId = "default"): string {
  const db = getDB(homeId);
  const row = db.prepare("SELECT value FROM kv WHERE key = ?").get("password_hash");
  if (row) return row.value;
  const hash = hashPassword(DEFAULT_PASSWORD);
  db.prepare("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)").run("password_hash", hash);
  return hash;
}

export function verifyPasswordServer(password: string, homeId = "default"): boolean {
  return hashPassword(password) === getPasswordHash(homeId);
}

export function changePasswordServer(current: string, next: string, homeId = "default"): boolean {
  if (hashPassword(current) !== getPasswordHash(homeId)) return false;
  getDB(homeId)
    .prepare("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)")
    .run("password_hash", hashPassword(next));
  return true;
}

export type ServerUser = {
  id: string;
  name: string;
  username: string;
  passwordHash: string;
  passkeyEnabled?: boolean;
  themeMode?: "light" | "dark" | "system";
  themePreset?: string;
  themeCustomHex?: string;
  createdAt: string;
  homeId: string;
  homes: string[];
};

export type HomeEntry = {
  id: string;
  name: string;
  code: string;
  owner: string;
};

const USERS_KEY = "users";
const HOMES_KEY = "homes";

function uidServer(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function homeCode(): string {
  return "HOME-" + Math.random().toString(36).substring(2, 8).toUpperCase();
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function freshHomeJSON(homeId: string, name: string, ownerName: string): string {
  const home: any = {
    id: homeId,
    name,
    code: homeCode(),
    createdAt: today(),
    members: [
      {
        id: "mem-" + uidServer(),
        name: ownerName || "Owner",
        role: "owner",
        joinedAt: today(),
      },
    ],
  };
  return JSON.stringify({
    accounts: [],
    categoryGroups: [],
    categories: [],
    payees: [],
    transactions: [],
    monthlyBudgets: [],
    goals: [],
    splits: [],
    loans: [],
    settings: {},
    households: [home],
    activeHomeId: homeId,
  });
}

export function loadHomesRegistry(): HomeEntry[] {
  const db = getDB("default");
  const row = db.prepare("SELECT value FROM kv WHERE key = ?").get(HOMES_KEY);
  let entries: HomeEntry[] = [];
  if (row) {
    try {
      const parsed = JSON.parse(row.value);
      if (Array.isArray(parsed)) entries = parsed;
    } catch {}
  }
  if (!entries.some((h) => h.id === "home-default")) {
    const existing = loadDBValue("default");
    let name = "Shantanu's Home";
    let code = homeCode();
    if (existing) {
      try {
        const parsed = JSON.parse(existing);
        const first = parsed.households?.[0];
        if (first) {
          if (first.name) name = first.name;
          if (first.code) code = first.code;
        }
      } catch {}
    }
    entries.unshift({ id: "home-default", name, code, owner: "shantanu" });
    saveHomesRegistry(entries);
  }
  return entries;
}

export function saveHomesRegistry(entries: HomeEntry[]): void {
  getDB("default")
    .prepare("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)")
    .run(HOMES_KEY, JSON.stringify(entries));
}

export function provisionHomeServer(
  homeId: string,
  name: string,
  ownerName: string,
  ownerUsername: string,
): { ok: boolean; id: string; name: string; code: string; error?: string } {
  const cleanId = (homeId || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!cleanId || cleanId === "default" || cleanId === "home-default") {
    return { ok: false, id: "", name: "", code: "", error: "Invalid home id." };
  }
  const code = homeCode();
  saveDBValue(freshHomeJSON(cleanId, name, ownerName), cleanId);
  const entries = loadHomesRegistry();
  if (!entries.some((h) => h.id === cleanId)) {
    entries.push({ id: cleanId, name, code, owner: ownerUsername });
    saveHomesRegistry(entries);
  }
  return { ok: true, id: cleanId, name, code };
}

export function createHomeServer(
  name: string,
  username: string,
): { ok: boolean; home?: HomeEntry; error?: string } {
  const cleanName = (name || "").trim() || "Family Home";
  const users = loadUsersServer("default");
  const me = users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase());
  if (!me) return { ok: false, error: "User not found." };
  const prov = provisionHomeServer("home-" + uidServer(), cleanName, me.name, me.username);
  if (!prov.ok) return { ok: false, error: prov.error };
  if (!me.homes) me.homes = [];
  if (!me.homes.includes(prov.id)) me.homes.push(prov.id);
  me.homeId = me.homeId || prov.id;
  saveUsersServer(users, "default");
  return { ok: true, home: { id: prov.id, name: prov.name, code: prov.code, owner: me.username } };
}

export function joinHomeServer(
  code: string,
  username: string,
): { ok: boolean; homeId?: string; name?: string; error?: string } {
  const cleanCode = (code || "").trim().toUpperCase();
  if (!cleanCode) return { ok: false, error: "Please enter an invite code." };
  const entry = loadHomesRegistry().find((h) => h.code.toUpperCase() === cleanCode);
  if (!entry) return { ok: false, error: "Invite code not found." };

  const users = loadUsersServer("default");
  const me = users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase());
  if (!me) return { ok: false, error: "User not found." };

  if (!me.homes) me.homes = [];
  if (!me.homes.includes(entry.id)) {
    me.homes.push(entry.id);
    saveUsersServer(users, "default");
    try {
      const db = getDB(entry.id);
      const row = db.prepare("SELECT value FROM kv WHERE key = ?").get("db");
      if (row) {
        const parsed = JSON.parse(row.value);
        const home = parsed.households?.find((h: any) => h.id === entry.id);
        if (home && !home.members.some((m: any) => m.name === me.name)) {
          home.members.push({
            id: "mem-" + uidServer(),
            name: me.name,
            role: "editor",
            joinedAt: today(),
          });
          saveDBValue(JSON.stringify(parsed), entry.id);
        }
      }
    } catch {}
  }
  return { ok: true, homeId: entry.id, name: entry.name };
}

function ensureUserHome(user: ServerUser): boolean {
  if (user.homeId && Array.isArray(user.homes)) return false;
  if (!user.homeId) {
    if (user.username.toLowerCase() === "shantanu") {
      user.homeId = "home-default";
      user.homes = ["home-default"];
    } else {
      const prov = provisionHomeServer(
        "home-" + uidServer(),
        user.name + "'s Home",
        user.name,
        user.username,
      );
      if (prov.ok) {
        user.homeId = prov.id;
        user.homes = [prov.id];
      }
    }
    return true;
  }
  if (!Array.isArray(user.homes)) {
    user.homes = [user.homeId];
    return true;
  }
  return false;
}

export function saveUsersServer(users: ServerUser[], homeId = "default"): void {
  getDB(homeId)
    .prepare("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)")
    .run(USERS_KEY, JSON.stringify(users));
}

export function loadUsersServer(homeId = "default"): ServerUser[] {
  const db = getDB(homeId);
  const row = db.prepare("SELECT value FROM kv WHERE key = ?").get(USERS_KEY);
  if (row) {
    try {
      const parsed = JSON.parse(row.value);
      if (Array.isArray(parsed) && parsed.length > 0) {
        let changed = false;
        for (const u of parsed) {
          if (ensureUserHome(u)) changed = true;
        }
        if (changed) saveUsersServer(parsed, homeId);
        return parsed;
      }
    } catch {}
  }
  const masterRow = db.prepare("SELECT value FROM kv WHERE key = ?").get("password_hash");
  const masterHash = masterRow ? masterRow.value : hashPassword(DEFAULT_PASSWORD);
  const defaultUser: ServerUser = {
    id: "usr-shantanu",
    name: "Shantanu",
    username: "shantanu",
    passwordHash: masterHash,
    passkeyEnabled: false,
    createdAt: today(),
    homeId: "home-default",
    homes: ["home-default"],
  };
  saveUsersServer([defaultUser], homeId);
  return [defaultUser];
}

export function registerUserServer(
  input: { name: string; username: string; password?: string },
  homeId = "default",
): { ok: boolean; error?: string; user?: Omit<ServerUser, "passwordHash"> } {
  const cleanUsername = (input.username || "").trim().toLowerCase();
  const cleanName = (input.name || "").trim();
  if (!cleanName || !cleanUsername) {
    return { ok: false, error: "Please enter name and username." };
  }
  const users = loadUsersServer(homeId);
  if (users.some((u) => u.username.toLowerCase() === cleanUsername)) {
    return { ok: false, error: "Username is already taken." };
  }
  const homeId2 = "home-" + uidServer();
  const prov = provisionHomeServer(homeId2, cleanName + "'s Home", cleanName, cleanUsername);
  if (!prov.ok) return { ok: false, error: prov.error };
  const newUser: ServerUser = {
    id: "usr-" + Math.random().toString(36).slice(2, 9),
    name: cleanName,
    username: cleanUsername,
    passwordHash: hashPassword(input.password || DEFAULT_PASSWORD),
    passkeyEnabled: false,
    createdAt: today(),
    homeId: homeId2,
    homes: [homeId2],
  };
  users.push(newUser);
  saveUsersServer(users, homeId);
  const { passwordHash: _omit, ...safeUser } = newUser;
  return { ok: true, user: safeUser };
}

export function verifyUserServer(
  username: string,
  password: string,
  homeId = "default",
): { ok: boolean; user?: Omit<ServerUser, "passwordHash"> } {
  const users = loadUsersServer(homeId);
  const target = users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase());
  if (!target) return { ok: false };
  if (hashPassword(password) !== target.passwordHash) return { ok: false };
  const { passwordHash: _omit, ...safeUser } = target;
  return { ok: true, user: safeUser };
}

export function changeUserPasswordServer(
  username: string,
  current: string,
  next: string,
  homeId = "default",
): { ok: boolean } {
  const users = loadUsersServer(homeId);
  const target = users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase());
  if (!target || hashPassword(current) !== target.passwordHash) return { ok: false };
  target.passwordHash = hashPassword(next);
  saveUsersServer(users, homeId);
  return { ok: true };
}

export function updateUserServer(
  username: string,
  patch: {
    passkeyEnabled?: boolean;
    themeMode?: "light" | "dark" | "system";
    themePreset?: string;
    themeCustomHex?: string;
  },
  homeId = "default",
): { ok: boolean; user?: Omit<ServerUser, "passwordHash"> } {
  const users = loadUsersServer(homeId);
  const target = users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase());
  if (!target) return { ok: false };
  if (typeof patch.passkeyEnabled === "boolean") target.passkeyEnabled = patch.passkeyEnabled;
  if (patch.themeMode && ["light", "dark", "system"].includes(patch.themeMode)) {
    target.themeMode = patch.themeMode;
  }
  if (typeof patch.themePreset === "string") target.themePreset = patch.themePreset;
  if (typeof patch.themeCustomHex === "string") target.themeCustomHex = patch.themeCustomHex;
  saveUsersServer(users, homeId);
  const { passwordHash: _omit, ...safeUser } = target;
  return { ok: true, user: safeUser };
}
