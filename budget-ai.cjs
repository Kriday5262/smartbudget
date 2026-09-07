const { DatabaseSync } = require("node:sqlite");
const crypto = require("crypto");
const fs = require("fs");

const DB_PATH = process.env.DB_PATH || "/home/kriday/smartbudget/data/budget.db";
const LOG_PATH = process.env.AI_LOG || "/home/kriday/smartbudget/data/ai-log.txt";
const AI_URL = process.env.AI_URL || "https://api.deepseek.com/v1/chat/completions";
const AI_API_KEY = process.env.AI_API_KEY || "";
const MODEL = process.env.AI_MODEL || "deepseek-v4-flash";
const POLL_INTERVAL = parseInt(process.env.AI_POLL || "30000", 10);
const MAX_AI_CALLS = 5;

/* ------------------------------------------------------------------ */
/* Keep parity with src/lib/security.ts: the server encrypts kv rows  */
/* (db, ai_activity, ...) as "enc1:iv:authTag:ciphertext" base64url   */
/* using AES-256-GCM keyed by sha256(SMARTBUDGET_ENC_KEY). We must    */
/* read + write with the same scheme or we corrupt the data.          */
/* ------------------------------------------------------------------ */
const ENC_PREFIX = "enc1:";

function dataKey() {
  const raw = process.env.SMARTBUDGET_ENC_KEY;
  if (raw && raw.length >= 32) {
    return crypto.createHash("sha256").update(raw, "utf8").digest();
  }
  const seed = process.env.HOSTNAME || process.env.SMARTBUDGET_HOST || "smartbudget";
  return crypto.createHash("sha256").update(seed + "::smartbudget-data-key").digest();
}

function encryptValue(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", dataKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENC_PREFIX + [iv.toString("base64url"), tag.toString("base64url"), enc.toString("base64url")].join(":");
}

function decryptValue(payload) {
  try {
    const [ivB, tagB, ctB] = payload.split(":");
    const decipher = crypto.createDecipheriv("aes-256-gcm", dataKey(), Buffer.from(ivB, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ctB, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Read a kv value, transparently handling encrypted (enc1:) and legacy plaintext rows. */
function kvRead(db, key) {
  const row = db.prepare("SELECT value FROM kv WHERE key = ?").get(key);
  if (!row) return null;
  const raw = row.value;
  if (typeof raw === "string" && raw.startsWith(ENC_PREFIX)) {
    return decryptValue(raw.slice(ENC_PREFIX.length));
  }
  return raw;
}

function kvWrite(db, key, value) {
  db.prepare("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)").run(key, encryptValue(value));
}

let lastSnapshot = null;

/* ---------- helpers ---------- */

function log(tag, msg) {
  const ts = new Date().toISOString().replace("T", " ").substring(0, 19);
  const line = "[" + ts + "] [" + tag + "] " + msg;
  console.log(line);
  try {
    fs.appendFileSync(LOG_PATH, line + "\n");
  } catch {}
  // Save to SQLite for the app to display
  try {
    saveActivity(ts, tag, msg);
  } catch {}
}

function saveActivity(ts, type, msg) {
  var db = new DatabaseSync(DB_PATH);
  var raw = kvRead(db, "ai_activity");
  var activity = raw ? JSON.parse(raw) : [];
  // Skip SCAN entries from activity feed (too noisy)
  if (type !== "SCAN") {
    activity.push({ ts: ts, type: type, msg: msg });
    if (activity.length > 100) activity = activity.slice(-100);
    kvWrite(db, "ai_activity", JSON.stringify(activity));
  } else {
    // Just update the last scan timestamp
    kvWrite(db, "ai_activity", JSON.stringify(activity));
  }
  db.close();
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function readDB() {
  const db = new DatabaseSync(DB_PATH);
  try {
    const raw = kvRead(db, "db");
    db.close();
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    db.close();
    return null;
  }
}

function writeDB(data) {
  const db = new DatabaseSync(DB_PATH);
  kvWrite(db, "db", JSON.stringify(data));
  db.close();
}

function hash(str) {
  return crypto.createHash("md5").update(str).digest("hex");
}

/* ---------- Ollama ---------- */

async function askGemma(systemPrompt, userPrompt) {
  const body = JSON.stringify({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    stream: false,
    temperature: 0.2,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(AI_API_KEY ? { Authorization: "Bearer " + AI_API_KEY } : {}),
      },
      body,
      signal: controller.signal,
    });
    const data = await response.json();
    return data.choices?.[0]?.message?.content || data.message?.content || "";
  } catch (err) {
    log("ERROR", "AI request failed: " + err.message);
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

function parseJSON(text) {
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {}
  }
  return null;
}

/* ---------- AI categorization ---------- */

async function categorizeTxn(txn, db) {
  const cats = db.categories
    .map(function (c) {
      var g = db.categoryGroups.find(function (x) {
        return x.id === c.groupId;
      });
      return "- " + c.id + ": " + c.name + " (" + (g ? g.name : "Unknown") + ")";
    })
    .join("\n");

  var groups = db.categoryGroups
    .filter(function (g) {
      return !g.hidden;
    })
    .map(function (g) {
      return "- " + g.id + ": " + g.name;
    })
    .join("\n");

  var sys =
    "You are a budget categorization assistant for an Indian family budget app.\n" +
    "Given a transaction, pick the best category.\n\n" +
    "Available categories (id: name (group)):\n" +
    cats +
    "\n\n" +
    "Available category groups:\n" +
    groups +
    "\n\n" +
    "Rules:\n" +
    '- If it fits an existing category, respond: {"action":"assign","categoryId":"<id>"}\n' +
    '- If a new category is needed, respond: {"action":"create","categoryName":"<name>","groupId":"<group-id>"}\n' +
    "- Respond with ONLY the JSON object, no other text.";

  var usr =
    'Transaction: payee="' +
    (txn.payeeName || "Unknown") +
    '", memo="' +
    (txn.memo || "") +
    '", amount=' +
    txn.amount +
    ", date=" +
    txn.date;

  var resp = await askGemma(sys, usr);
  return parseJSON(resp);
}

/* ---------- main cycle ---------- */

async function runCycle() {
  var db = readDB();
  if (!db) {
    log("SCAN", "No database found, waiting for app init");
    return;
  }

  var currentHash = hash(JSON.stringify(db));
  var pendingChanges = [];

  /* 1. Observations: detect new / deleted since last cycle */
  if (lastSnapshot) {
    var newTxns = db.transactions.filter(function (t) {
      return !lastSnapshot.transactions.some(function (lt) {
        return lt.id === t.id;
      });
    });
    var delTxns = lastSnapshot.transactions.filter(function (lt) {
      return !db.transactions.some(function (t) {
        return t.id === lt.id;
      });
    });
    var newAccts = db.accounts.filter(function (a) {
      return !lastSnapshot.accounts.some(function (la) {
        return la.id === a.id;
      });
    });
    var delAccts = lastSnapshot.accounts.filter(function (la) {
      return !db.accounts.some(function (a) {
        return a.id === la.id;
      });
    });
    var newGoals = db.goals.filter(function (g) {
      return !lastSnapshot.goals.some(function (lg) {
        return lg.id === g.id;
      });
    });

    newTxns.forEach(function (t) {
      log(
        "NEW_TXN",
        (t.payeeName || "Unknown") +
          " | " +
          t.amount +
          " | " +
          t.date +
          (t.memo ? ' | "' + t.memo + '"' : ""),
      );
    });
    delTxns.forEach(function (t) {
      log("DEL_TXN", (t.payeeName || "Unknown") + " | " + t.amount + " | " + t.date);
    });
    newAccts.forEach(function (a) {
      log("NEW_ACCT", a.name + " (" + a.type + ") balance:" + a.startingBalance);
    });
    delAccts.forEach(function (a) {
      log("DEL_ACCT", a.name + " (" + a.type + ")");
    });
    newGoals.forEach(function (g) {
      log("NEW_GOAL", g.name + " target:" + g.targetAmount);
    });

    if (
      newTxns.length === 0 &&
      delTxns.length === 0 &&
      newAccts.length === 0 &&
      delAccts.length === 0 &&
      newGoals.length === 0
    ) {
      log(
        "SCAN",
        "No changes detected | " +
          db.transactions.length +
          " txns, " +
          db.accounts.length +
          " accts, " +
          db.categories.length +
          " cats, " +
          db.payees.length +
          " payees",
      );
    }
  } else {
    log(
      "INIT",
      "First scan | " +
        db.transactions.length +
        " txns, " +
        db.accounts.length +
        " accts, " +
        db.categories.length +
        " cats, " +
        db.payees.length +
        " payees",
    );
  }

  /* 2. AI categorization for uncategorized transactions.
        Income (amount > 0) is intentionally left uncategorized — it lands in
        "Ready to Assign" instead of creating a new category. */
  var uncategorized = db.transactions.filter(function (t) {
    return t.amount < 0 && !t.categoryId && !t.transferId;
  });

  if (uncategorized.length > 0) {
    log("AI", uncategorized.length + " uncategorized transactions found");
    var aiCount = 0;
    for (var i = 0; i < uncategorized.length && aiCount < MAX_AI_CALLS; i++) {
      var txn = uncategorized[i];
      log(
        "AI",
        "Categorizing: " +
          (txn.payeeName || "Unknown") +
          ' memo="' +
          (txn.memo || "") +
          '" amount=' +
          txn.amount,
      );
      var result = await categorizeTxn(txn, db);
      aiCount++;
      if (result) {
        pendingChanges.push({ type: "categorize", txnId: txn.id, result: result });
      } else {
        log("AI", "Could not parse response for: " + (txn.payeeName || "Unknown"));
      }
    }
  }

  /* 4. Apply all changes to a fresh DB read */
  if (pendingChanges.length > 0) {
    var latest = readDB();
    if (!latest) {
      log("ERROR", "Could not re-read DB for apply");
      lastSnapshot = db;
      return;
    }
    var originalHash = hash(JSON.stringify(latest));
    var modified = false;
    var applied = 0;

    pendingChanges.forEach(function (change) {
      if (change.type === "categorize") {
        var txn = latest.transactions.find(function (t) {
          return t.id === change.txnId;
        });
        if (txn && !txn.categoryId && !txn.transferId && txn.amount < 0) {
          var r = change.result;
          if (r.action === "assign" && r.categoryId) {
            var cat = latest.categories.find(function (c) {
              return c.id === r.categoryId;
            });
            if (cat) {
              txn.categoryId = r.categoryId;
              log("AI", 'Assigned "' + cat.name + '" to ' + (txn.payeeName || "Unknown"));
              modified = true;
              applied++;
            } else {
              log("AI", "Category ID not found: " + r.categoryId);
            }
          } else if (r.action === "create" && r.categoryName && r.groupId) {
            var grp = latest.categoryGroups.find(function (g) {
              return g.id === r.groupId;
            });
            if (grp) {
              var newId = uid();
              latest.categories.push({
                id: newId,
                groupId: r.groupId,
                name: r.categoryName,
                sortOrder: latest.categories.filter(function (c) {
                  return c.groupId === r.groupId;
                }).length,
                hidden: false,
              });
              txn.categoryId = newId;
              log(
                "AI",
                'Created "' +
                  r.categoryName +
                  '" in ' +
                  grp.name +
                  ", assigned to " +
                  (txn.payeeName || "Unknown"),
              );
              modified = true;
              applied += 2;
            }
          }
        }
      }
    });

    if (modified) {
      /* optimistic check: make sure DB hasn't changed during apply */
      var preWrite = readDB();
      if (preWrite && hash(JSON.stringify(preWrite)) === originalHash) {
        writeDB(latest);
        log("SAVE", applied + " changes applied to database");
      } else {
        log("CONFLICT", "DB changed during apply, will retry next cycle");
      }
    }
  }

  lastSnapshot = db;
}

/* ---------- main loop ---------- */

async function main() {
  log("START", "Budget AI service started");
  log("START", "Model: " + MODEL + " | Poll: " + POLL_INTERVAL + "ms | DB: " + DB_PATH);

  while (true) {
    try {
      await runCycle();
    } catch (err) {
      log("ERROR", "Cycle failed: " + err.message + " | " + err.stack);
    }
    await new Promise(function (r) {
      setTimeout(r, POLL_INTERVAL);
    });
  }
}

main();
