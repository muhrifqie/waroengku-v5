import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { app } from "electron";
import initSqlJs from "sql.js";

const require = createRequire(import.meta.url);

let db = null;
let file = null;
let SQLjs = null;

export async function initDb() {
  file = path.join(app.getPath("userData"), "capcut.db");
  const SQL = await initSqlJs({
    locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
  });
  SQLjs = SQL;
  db = fs.existsSync(file) ? new SQL.Database(fs.readFileSync(file)) : new SQL.Database();
  db.run("PRAGMA temp_store=MEMORY"); // sql.js in-memory VFS: tanpa ini VACUUM → SQLITE_CANTOPEN
  db.run(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product TEXT DEFAULT 'capcut',
      email TEXT UNIQUE, password TEXT, prices TEXT, cookies_json TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
  `);
  const cols = new Set([...db.exec("PRAGMA table_info(accounts)")[0].values].map((v) => v[1]));
  if (!cols.has("product")) db.run("ALTER TABLE accounts ADD COLUMN product TEXT DEFAULT 'capcut'");
  if (!cols.has("pipopay_link")) db.run("ALTER TABLE accounts ADD COLUMN pipopay_link TEXT"); // link checkout VN

  db.run(`CREATE TABLE IF NOT EXISTS proxies (
    id INTEGER PRIMARY KEY AUTOINCREMENT, raw TEXT, scheme TEXT, host TEXT, port INTEGER,
    username TEXT, password TEXT, ip TEXT, country TEXT, isp TEXT, latency INTEGER, ok INTEGER,
    created_at TEXT DEFAULT (datetime('now')), UNIQUE(host, port))`);
  db.run(`CREATE TABLE IF NOT EXISTS folders (
    key TEXT PRIMARY KEY, name TEXT, icon TEXT, created_at TEXT DEFAULT (datetime('now')))`);
  if (all("SELECT COUNT(*) AS c FROM folders")[0].c === 0) {
    for (const [key, name, icon] of [["capcut", "CapCut", "video"], ["outlook", "Outlook", "mail"], ["hma", "HMA", "shield"], ["zoom", "Zoom", "monitor"]])
      db.run("INSERT INTO folders (key, name, icon) VALUES (?,?,?)", [key, name, icon]);
  }
  dirty = true;
  flushDb();
}

// ---------- folders ----------
export function listFolders() {
  return all("SELECT key, name, icon FROM folders ORDER BY created_at");
}
export function createFolder(name, icon) {
  const base = (name || "folder").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "folder";
  let key = base, i = 1;
  while (all("SELECT 1 FROM folders WHERE key=?", [key]).length) key = `${base}-${++i}`;
  db.run("INSERT INTO folders (key, name, icon) VALUES (?,?,?)", [key, name || base, icon || "folder"]);
  persist();
  return key;
}
export function updateFolder(key, name, icon) {
  db.run("UPDATE folders SET name=?, icon=? WHERE key=?", [name, icon, key]);
  persist();
}
export function deleteFolder(key, reassignTo) {
  db.run("UPDATE accounts SET product=? WHERE product=?", [reassignTo || "uncategorized", key]);
  db.run("DELETE FROM folders WHERE key=?", [key]);
  persist();
}

// Debounce: banyak insert (batch) di-coalesce jadi sedikit tulis file → nggak ngelag.
let saveTimer = null;
let dirty = false;
function persist() {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(flushDb, 800);
}
export function flushDb() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (!dirty || !db) return;
  dirty = false;
  fs.writeFileSync(file, Buffer.from(db.export()));
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

// ---------- accounts ----------
export function listAccounts() {
  // JANGAN ambil cookies_json (bisa MB per baris) → cukup flag has_session biar ringan
  return all(
    `SELECT id, COALESCE(product,'capcut') AS product, email, password, prices, pipopay_link,
       CASE WHEN cookies_json IS NOT NULL AND cookies_json != '' THEN 1 ELSE 0 END AS has_session,
       created_at
     FROM accounts ORDER BY id DESC`
  );
}

export function saveAccount(a) {
  const keep = Object.fromEntries(
    Object.entries(a.prices || {}).filter(([k]) => /^pro|^tim|team/i.test(k))
  );
  db.run(
    `INSERT INTO accounts (product, email, password, prices, pipopay_link, cookies_json)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(email) DO UPDATE SET
       product=excluded.product, password=excluded.password, prices=excluded.prices,
       pipopay_link=COALESCE(excluded.pipopay_link, pipopay_link), cookies_json=excluded.cookies_json`,
    [a.product || "capcut", a.email, a.password, JSON.stringify(keep), a.checkoutLink || null, a.cookiesJson || null]
  );
  persist();
}

export function deleteAccounts(ids) {
  const q = `DELETE FROM accounts WHERE id IN (${ids.map(() => "?").join(",")})`;
  db.run(q, ids);
  persist();
}

export function getCookies(id) {
  const r = all("SELECT email, cookies_json FROM accounts WHERE id=?", [id]);
  return r[0] || null;
}

// impor akun dari accounts.db lama (Python). Skip email yang sudah ada.
export function importLegacy(legacyFile) {
  const src = new SQLjs.Database(fs.readFileSync(legacyFile));
  const cols = new Set(
    (src.exec("PRAGMA table_info(accounts)")[0]?.values || []).map((v) => v[1])
  );
  const ck = cols.has("cookies_json") ? "cookies_json" : "NULL";
  const stmt = src.prepare(
    `SELECT email, password, prices, ${ck} AS cookies_json, created_at FROM accounts`
  );
  const before = listAccounts().length;
  while (stmt.step()) {
    const r = stmt.getAsObject();
    db.run(
      `INSERT INTO accounts (email, password, prices, cookies_json, created_at)
       VALUES (?,?,?,?,?) ON CONFLICT(email) DO NOTHING`,
      [r.email, r.password, r.prices, r.cookies_json, r.created_at || null]
    );
  }
  stmt.free();
  src.close();
  persist();
  return listAccounts().length - before;
}

// ---------- backup / restore ----------
export function dbPath() { return file; }

export function exportTo(dest) {
  flushDb();
  fs.copyFileSync(file, dest);
  return { ok: true, path: dest, size: fs.statSync(dest).size };
}

export function importFrom(src) {
  const bytes = fs.readFileSync(src);
  let test;
  try {
    test = new SQLjs.Database(bytes);
    const r = test.exec("SELECT COUNT(*) c FROM accounts");
    const accounts = r[0]?.values?.[0]?.[0] ?? 0;
    test.close();
    if (db && db.close) db.close();
    db = new SQLjs.Database(bytes);
    db.run("PRAGMA temp_store=MEMORY");
    db.run(`
      CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, product TEXT DEFAULT 'capcut', email TEXT UNIQUE, password TEXT, prices TEXT, cookies_json TEXT, created_at TEXT DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS folders (key TEXT PRIMARY KEY, name TEXT, icon TEXT, created_at TEXT DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS proxies (id INTEGER PRIMARY KEY AUTOINCREMENT, raw TEXT, scheme TEXT, host TEXT, port INTEGER, username TEXT, password TEXT, ip TEXT, country TEXT, isp TEXT, latency INTEGER, ok INTEGER, created_at TEXT DEFAULT (datetime('now')), UNIQUE(host, port));
    `);
    dirty = true;
    flushDb();
    return { ok: true, accounts };
  } catch (e) {
    try { test?.close(); } catch {}
    return { ok: false, error: "File bukan database yang valid: " + e.message };
  }
}

// ---------- maintenance ----------
export function compactDb() {
  const before = fs.existsSync(file) ? fs.statSync(file).size : 0;
  const rows = all("SELECT id, cookies_json FROM accounts WHERE cookies_json IS NOT NULL AND cookies_json != ''");
  let trimmed = 0;
  for (const r of rows) {
    try {
      const st = JSON.parse(r.cookies_json);
      const n = (st.origins || []).length;
      st.origins = (st.origins || []).filter((o) => /capcut|byteoversea|ibyteimg|bytedance|tiktok/i.test(o.origin || ""));
      if (st.origins.length !== n) trimmed++;
      db.run("UPDATE accounts SET cookies_json=? WHERE id=?", [JSON.stringify(st), r.id]);
    } catch {}
  }
  try { db.run("PRAGMA temp_store=MEMORY"); db.run("VACUUM"); } catch {} // best-effort; jangan sampai crash
  dirty = true;
  flushDb();
  const after = fs.existsSync(file) ? fs.statSync(file).size : 0;
  return { before, after, rows: rows.length, trimmed };
}

// ---------- proxies ----------
export function randomProxies(limit = 200, scheme = null) {
  const w = scheme ? "ok=1 AND scheme=?" : "ok=1";
  return all(`SELECT scheme, host, port, username, password FROM proxies WHERE ${w} ORDER BY RANDOM() LIMIT ?`,
    scheme ? [scheme, limit] : [limit]);
}
export function listProxies() {
  return all("SELECT * FROM proxies ORDER BY ok DESC, latency ASC");
}
export function saveProxy(p) {
  db.run(
    `INSERT INTO proxies (raw, scheme, host, port, username, password, ip, country, isp, latency, ok)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(host, port) DO UPDATE SET
       raw=excluded.raw, scheme=excluded.scheme, username=excluded.username, password=excluded.password,
       ip=excluded.ip, country=excluded.country, isp=excluded.isp, latency=excluded.latency, ok=excluded.ok`,
    [p.raw, p.scheme || null, p.host, p.port, p.username || null, p.password || null,
     p.ip || null, p.country || null, p.isp || null, p.latency ?? null, p.ok ? 1 : 0]
  );
  persist();
}
export function deleteProxies(ids) {
  db.run(`DELETE FROM proxies WHERE id IN (${ids.map(() => "?").join(",")})`, ids);
  persist();
}

// ---------- settings ----------
export function getSettings() {
  const out = {};
  for (const r of all("SELECT key, value FROM settings")) {
    try {
      out[r.key] = JSON.parse(r.value);
    } catch {
      out[r.key] = r.value;
    }
  }
  return out;
}

export function setSettings(obj) {
  for (const [k, v] of Object.entries(obj)) {
    db.run(
      "INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      [k, JSON.stringify(v)]
    );
  }
  persist();
}
