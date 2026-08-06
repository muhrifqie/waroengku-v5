import { app, BrowserWindow, ipcMain, shell, dialog, Notification } from "electron";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import icon from "../../resources/icon.png?asset";
import * as store from "./db.js";
import os from "node:os";
import crypto from "node:crypto";
import { runBatch, restoreSession, refetchLink, runPayment, stopAll } from "./bot.js";
import { providerDomains, providerBalance, providerCheckDomain } from "./otp.js";
import { captchaBalance } from "./captcha.js";
import { adspowerStatus } from "./adspower.js";
import { runOutlookBatch } from "./outlookbot.js";
import { detectMany, checkProxies } from "./proxy.js";
import { cliproxyInfo, cliproxyFetch } from "./cliproxy.js";
import electronUpdater from "electron-updater";
const { autoUpdater } = electronUpdater;

// Token per-grup: create & payment jalan independen. Naik tiap start/stop grup → run lama grup itu kadaluarsa.
const runTokens = { create: 0, payment: 0 };

// Cegah instance ganda (penyebab "Unable to move the cache: Access is denied")
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
}
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
process.on("uncaughtException", (e) => console.error("uncaught:", e)); // jangan tampilkan dialog fatal

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isWin = process.platform === "win32";
const LOCALAPPDATA =
  process.env.LOCALAPPDATA || path.join(app.getPath("home"), "AppData", "Local");
const CAMOUFOX_EXE = path.join(
  LOCALAPPDATA, "camoufox", "camoufox", "Cache", "camoufox.exe"
);

let win;

function createWindow() {
  win = new BrowserWindow({
    title: "Waroengku V5",
    width: 1400,
    height: 920,
    minWidth: 1120,
    minHeight: 740,
    frame: false,
    backgroundColor: "#1f1f1e",
    icon,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: false,
    },
  });

  win.webContents.on("did-finish-load", () => win.webContents.setZoomFactor(1.15)); // perbesar seluruh UI ~15%

  win.on("maximize", () => win.webContents.send("win:state", true));
  win.on("unmaximize", () => win.webContents.send("win:state", false));

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

app.setAppUserModelId("com.waroeng.waroengkuv5"); // wajib agar notifikasi tampil di Windows

app.whenReady().then(async () => {
  await store.initDb();
  createWindow();
  if (app.isPackaged) setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 4000);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", () => {
  try { store.flushDb(); } catch {}
});

// ---------- window controls ----------
ipcMain.on("win:minimize", () => win?.minimize());
ipcMain.on("win:maximize", () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()));
ipcMain.on("win:close", () => win?.close());

// ---------- helpers ----------
function findCamoufoxCli() {
  const c = [
    path.join(__dirname, "../../node_modules/camoufox-js/dist/__main__.js"),
    path.join(app.getAppPath(), "node_modules/camoufox-js/dist/__main__.js"),
    path.join(__dirname, "../../../node/node_modules/camoufox-js/dist/__main__.js"),
  ];
  return c.find((p) => fs.existsSync(p)) || null;
}

function depsInstalled() {
  return !!findCamoufoxCli();
}

function stream(cmd, args, cwd, onLine, env) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, shell: isWin, env: env || process.env });
    const feed = (b) => String(b).split(/\r?\n/).filter(Boolean).forEach(onLine);
    p.stdout.on("data", feed);
    p.stderr.on("data", feed);
    p.on("close", (code) => resolve(code));
    p.on("error", (e) => {
      onLine(`ERROR: ${e.message}`);
      resolve(1);
    });
  });
}

function exec(cmd, args) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { shell: isWin });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => resolve({ code, out: out.trim() }));
    p.on("error", () => resolve({ code: 1, out: "" }));
  });
}

async function detectPython() {
  for (const cmd of ["python", "python3", "py"]) {
    const r = await exec(cmd, ["--version"]);
    const m = r.out.match(/Python\s+([\d.]+)/i);
    if (r.code === 0 && m) {
      const pip = (await exec(cmd, ["-m", "pip", "--version"])).code === 0;
      return { ok: true, cmd, version: m[1], pip };
    }
  }
  return { ok: false };
}

function requirementsFile() {
  return [
    path.join(__dirname, "../../resources/requirements.txt"),
    path.join(process.resourcesPath || "", "requirements.txt"),
  ].find((p) => fs.existsSync(p));
}
function requiredPyPkgs() {
  const f = requirementsFile();
  if (!f) return [];
  return fs.readFileSync(f, "utf-8").split("\n").map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#")).map((l) => l.split(/[=<>~!\s]/)[0].trim().toLowerCase());
}
async function pythonDeps(py) {
  const required = requiredPyPkgs();
  if (!required.length) return { required: [], missing: [] };
  if (!py?.ok) return { required, missing: required };
  const freeze = (await exec(py.cmd, ["-m", "pip", "freeze"])).out.toLowerCase();
  const installed = new Set(freeze.split("\n").map((l) => l.split(/[=<>~!]/)[0].trim()));
  return { required, missing: required.filter((r) => !installed.has(r)) };
}

// ---------- setup IPC ----------
ipcMain.handle("setup:check", async () => {
  const python = await detectPython();
  const pydeps = await pythonDeps(python);
  return {
    node: process.versions.node,
    electron: process.versions.electron,
    deps: depsInstalled(),
    browser: fs.existsSync(CAMOUFOX_EXE),
    python,
    pydeps,
  };
});

ipcMain.handle("setup:install", async (evt) => {
  const send = (line, level = "info") => evt.sender.send("setup:log", { line, level });
  const appDir = path.join(__dirname, "../..");

  if (!depsInstalled()) {
    send("Menginstall dependencies (npm install) ...", "step");
    const code = await stream(isWin ? "npm.cmd" : "npm", ["install"], appDir, (l) => send(l));
    if (code !== 0) return send("Gagal menginstall dependencies", "warn"), { ok: false };
    send("Dependencies terpasang", "ok");
  } else {
    send("Dependencies sudah ada", "ok");
  }

  if (!fs.existsSync(CAMOUFOX_EXE)) {
    const cli = findCamoufoxCli();
    if (!cli) return send("camoufox-js tidak ditemukan", "warn"), { ok: false };
    send("Mengunduh browser Camoufox (± 150 MB) ...", "step");
    const nodeEnv = { ...process.env, ELECTRON_RUN_AS_NODE: "1" };
    const code = await stream(process.execPath, [cli, "fetch"], path.dirname(cli),
      (l) => send(l), nodeEnv);
    if (code !== 0) return send("Gagal mengunduh Camoufox", "warn"), { ok: false };
    send("Browser Camoufox siap", "ok");
  } else {
    send("Browser Camoufox sudah ada", "ok");
  }

  // Python packages (opsional — hanya kalau Python ada & ada requirements.txt)
  const py = await detectPython();
  const reqFile = requirementsFile();
  if (py.ok && reqFile) {
    const { missing } = await pythonDeps(py);
    if (missing.length) {
      send(`Menginstall Python packages (${missing.length}) ...`, "step");
      const code = await stream(py.cmd, ["-m", "pip", "install", "-r", reqFile], path.dirname(reqFile), (l) => send(l));
      if (code !== 0) send("Sebagian Python package gagal (bisa dilanjut)", "warn");
      else send("Python packages terpasang", "ok");
    } else {
      send("Python packages sudah lengkap", "ok");
    }
  } else if (!py.ok && reqFile) {
    send("Python belum terpasang — lewati Python packages", "warn");
  }

  send("Semua kebutuhan terpenuhi 🎉", "ok");
  return { ok: true };
});

ipcMain.on("open-external", (_e, url) => shell.openExternal(url));
ipcMain.on("notify", (_e, { title, body }) => {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title: title || "Waroengku V5", body: body || "", icon, silent: false });
  n.on("click", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  n.show();
});

// ---------- database IPC ----------
ipcMain.handle("db:list", () => store.listAccounts());
ipcMain.handle("db:delete", (_e, ids) => (store.deleteAccounts(ids), store.listAccounts()));
ipcMain.handle("db:importLegacy", async () => {
  const guess = path.join(__dirname, "../../_backup/accounts.db");
  const res = await dialog.showOpenDialog(win, {
    title: "Pilih accounts.db lama",
    defaultPath: fs.existsSync(guess) ? guess : app.getPath("home"),
    filters: [{ name: "SQLite DB", extensions: ["db", "sqlite", "sqlite3"] }],
    properties: ["openFile"],
  });
  if (res.canceled || !res.filePaths[0]) return { ok: false };
  try {
    return { ok: true, count: store.importLegacy(res.filePaths[0]) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
ipcMain.handle("db:compact", () => store.compactDb());
ipcMain.handle("db:export", async () => {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const res = await dialog.showSaveDialog(win, {
    title: "Export database",
    defaultPath: `waroengku-backup-${stamp}.db`,
    filters: [{ name: "SQLite DB", extensions: ["db"] }],
  });
  if (res.canceled || !res.filePath) return { ok: false };
  try { return store.exportTo(res.filePath); }
  catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle("db:import", async () => {
  const res = await dialog.showOpenDialog(win, {
    title: "Pilih file backup",
    filters: [{ name: "SQLite DB", extensions: ["db", "sqlite", "sqlite3"] }],
    properties: ["openFile"],
  });
  if (res.canceled || !res.filePaths[0]) return { ok: false };
  return store.importFrom(res.filePaths[0]);
});
ipcMain.on("db:open-folder", () => shell.showItemInFolder(store.dbPath()));
ipcMain.handle("proxy:list", () => store.listProxies());
ipcMain.handle("proxy:delete", (_e, ids) => (store.deleteProxies(ids), store.listProxies()));
ipcMain.handle("cliproxy:info", async (_e, creds) => {
  try { return await cliproxyInfo(creds || {}); }
  catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle("cliproxy:fetch", async (_e, { creds, num, country }) => {
  try {
    const fetched = await cliproxyFetch(creds || {}, num || 1, country || "VN");
    const { alive, dead } = await checkProxies(fetched); // cek hidup/mati dulu
    for (const p of alive) store.saveProxy({ ...p, ok: 1 });
    for (const p of dead) store.saveProxy({ ...p, ok: 0 });
    return { ok: true, proxies: alive, dead: dead.length };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle("proxy:detect", async (_e, lines) => {
  const results = await detectMany(lines);
  for (const r of results) if (r.ok) store.saveProxy(r);
  return { results, saved: store.listProxies() };
});

ipcMain.handle("folders:list", () => store.listFolders());
ipcMain.handle("folders:create", (_e, { name, icon }) => (store.createFolder(name, icon), store.listFolders()));
ipcMain.handle("folders:update", (_e, { key, name, icon }) => (store.updateFolder(key, name, icon), store.listFolders()));
ipcMain.handle("folders:delete", (_e, { key, reassignTo }) => (store.deleteFolder(key, reassignTo), store.listFolders()));

ipcMain.handle("settings:get", () => store.getSettings());
ipcMain.handle("settings:set", (_e, obj) => store.setSettings(obj));

// ---------- bot IPC ----------
function makeHooks(evt, group = "create") {
  const send = (ch, payload) => evt.sender.send(ch, payload);
  return {
    log: (line, level = "info", tag) => {
      if (level === "captcha" && win) { win.flashFrame(true); win.show(); }
      send("bot:log", { line, level, tag, group });
    },
    progress: (done, total) => {
      win?.setProgressBar(total ? done / total : 2, total ? {} : { mode: "indeterminate" }); // progress di icon taskbar Windows
      send("bot:progress", { done, total, group });
    },
    saved: (acc) => { store.saveAccount(acc); send("bot:saved", acc); },
    proxyDead: (p) => store.deleteProxyByHostPort(p.host, p.port), // proxy sekali pakai / mati → hapus dari pool
    linkUpdated: (id, link) => store.setPipopayLink(id, link), // simpan link Pipopay baru saat di-refetch
    qr: (id, dataUri, expire) => send("pay:qr", { id, dataUri, expire }), // mirror QR MoMo ke app
    payStatus: (id, status, message) => send("pay:status", { id, status, message }),
    paid: (id) => store.markPaid(id), // sukses → tandai Pro, hapus link, pindah folder
    removeAccount: (id) => store.deleteAccounts([id]), // Pro sudah tak gratis → hapus akun
  };
}

// Bungkus batch: progress indeterminate di taskbar saat mulai, bersihkan + flash saat selesai.
async function runWithTaskbar(evt, runner, group = "create") {
  const my = ++runTokens[group]; // token khusus run ini di grup-nya
  win?.setProgressBar(2, { mode: "indeterminate" });
  try {
    return await runner(makeHooks(evt, group), () => my !== runTokens[group]); // shouldStop: true begitu grup di-stop/start ulang
  } finally {
    win?.setProgressBar(-1);
    if (win && !win.isFocused()) win.flashFrame(true); // kedipkan icon taskbar saat kelar
  }
}
function withProxies(cfg) {
  // proxy eksplisit dari renderer menang; kalau tidak ada, ambil dari pool
  if (cfg.useProxy && !cfg.proxies?.length) cfg.proxies = store.randomProxies(200, cfg.region === "vn" ? "socks5" : null);
  return cfg;
}

ipcMain.handle("bot:start", (evt, cfg) => runWithTaskbar(evt, async (hooks, shouldStop) => {
  cfg = withProxies({ ...cfg, group: "create" });
  // VN: cek proxy hidup/mati dulu, lalu jalan 1 akun per proxy hidup (sampai habis)
  if (cfg.region === "vn" && cfg.proxies?.length) {
    hooks.log(`Checking ${cfg.proxies.length} proxies…`);
    const { alive, dead } = await checkProxies(cfg.proxies);
    for (const d of dead) store.deleteProxyByHostPort(d.host, d.port); // auto-hapus yg mati (sekali pakai)
    if (dead.length) hooks.log(`${dead.length} proxy mati — dihapus`, "warn");
    if (!alive.length) { hooks.log("Semua proxy mati — dibatalkan", "error"); return { ok: 0, total: 0 }; }
    cfg.proxies = alive;
    hooks.log(`${alive.length} proxy hidup — jalan nonstop sampai proxy habis`, "success");
  }
  return runBatch(cfg, hooks, shouldStop);
}));
// Stop per-grup: "create" atau "payment" — hanya kadaluarsakan run + tutup browser grup itu, grup lain tetap jalan.
ipcMain.on("bot:stop", (_e, group = "create") => { runTokens[group] = (runTokens[group] || 0) + 1; stopAll(group); win?.setProgressBar(-1); });

// Penyedia proxy VN utk Auto Payment: pakai pool yg hidup dulu; hanya beli 1 dari CLIProxy kalau habis.
function makeVnAcquirer(hooks) {
  let cache = null, refilling = null;
  async function refill() {
    const pool = store.randomProxies(100, "socks5");
    const { alive, dead } = await checkProxies(pool);
    for (const d of dead) store.deleteProxyByHostPort(d.host, d.port);
    if (dead.length) hooks.log(`${dead.length} proxy mati dihapus`, "warn");
    cache = alive;
  }
  return async function acquire() {
    if (!cache) { if (!refilling) refilling = refill(); await refilling; }
    if (cache.length) return cache.shift();
    // pool habis → beli 1 dari CLIProxy
    const creds = store.getSettings().integrations?.cliproxy || {};
    if (!creds.key || !creds.token) { hooks.log("CLIProxy belum diatur — tak bisa beli proxy VN", "error"); return null; }
    hooks.log("Proxy VN habis — beli 1 dari CLIProxy", "warn");
    try {
      const bought = await cliproxyFetch(creds, 1, "VN");
      for (const p of bought) store.saveProxy({ ...p, ok: 1 });
      const { alive } = await checkProxies(bought);
      cache = alive;
      return cache.length ? cache.shift() : null;
    } catch (e) { hooks.log("Beli proxy gagal: " + e.message, "error"); return null; }
  };
}

// Proxy pembayaran sesuai pilihan user: proxyless / dataimpulse / cliproxy.
function makePayAcquirer(hooks, mode) {
  if (mode === "proxyless") return async () => null;
  if (mode === "dataimpulse") {
    const url = (store.getSettings().integrations?.dataimpulse?.proxy || "").trim();
    const m = url.match(/^https?:\/\/([^:@]+):([^@]+)@([^:@]+):(\d+)$/);
    if (!m) { hooks.log("DataImpulse belum diatur / format salah", "error"); return async () => null; }
    const [, user, pass, host, port] = m;
    const proxy = { scheme: "http", host, port: Number(port), username: `${user}__cr.vn`, password: pass }; // gateway VN rotating
    return async () => proxy;
  }
  return makeVnAcquirer(hooks); // cliproxy: pool dulu, beli 1 kalau habis
}

ipcMain.handle("pay:start", (evt, cfg) => runWithTaskbar(evt, (hooks, shouldStop) => {
  const accounts = (cfg.ids || [])
    .map((id) => { const r = store.getPayInfo(id); return r && { id: r.id, email: r.email, cookiesJson: r.cookies_json, link: r.pipopay_link }; })
    .filter(Boolean);
  if (!accounts.length) { hooks.log("Tidak ada akun valid", "warn"); return { ok: 0, total: 0 }; }
  hooks.log(`Proxy pembayaran: ${cfg.proxyMode || "dataimpulse"} · refetch link: CLIProxy`);
  return runPayment({
    accounts, headless: cfg.headless, group: "payment",
    acquirePayProxy: makePayAcquirer(hooks, cfg.proxyMode || "dataimpulse"),
    acquireCliProxy: makeVnAcquirer(hooks), // refetch link expired WAJIB CLIProxy
  }, hooks, shouldStop);
}, "payment"));
ipcMain.handle("outlook:start", (evt, cfg) => runWithTaskbar(evt, (hooks, shouldStop) => runOutlookBatch(withProxies({ ...cfg, group: "create" }), hooks, shouldStop)));
ipcMain.handle("canva:start", (evt, cfg) => runWithTaskbar(evt, (hooks, shouldStop) => runBatch(withProxies({ ...cfg, kind: "canva", group: "create" }), hooks, shouldStop)));

ipcMain.handle("bot:restore", async (evt, id) => {
  const row = store.getCookies(id);
  const log = (line, level = "info") => evt.sender.send("bot:log", { line, level });
  if (!row || !row.cookies_json) return log(`No saved session for ${row?.email || "id " + id}`, "warn"), { ok: false };
  try {
    await restoreSession(row.cookies_json, log);
    return { ok: true };
  } catch (e) {
    log(`Restore gagal: ${e.message}`, "warn");
    return { ok: false };
  }
});

ipcMain.handle("link:refetch", async (evt, id) => {
  const row = store.getCookies(id);
  const log = (line, level = "info") => evt.sender.send("bot:log", { line, level, tag: `#${id}` });
  if (!row?.cookies_json) return log(`No saved session for id ${id}`, "warn"), { ok: false, error: "Akun tidak punya sesi" };
  const proxy = store.randomProxies(1, "socks5")[0];
  if (!proxy) return log("No SOCKS5 proxy available", "warn"), { ok: false, error: "Belum ada proxy SOCKS5 Vietnam (isi di halaman Proxy)" };
  try {
    const link = await refetchLink(row.cookies_json, proxy, log, true);
    if (!link) return { ok: false, error: "Link tidak didapat" };
    store.setPipopayLink(id, link);
    log(`Pipopay link updated: ${link}`, "success");
    return { ok: true, link };
  } catch (e) {
    if (e.name === "AlreadyPro") { store.markPaid(id); log("Akun sudah Pro — ditandai", "success"); return { ok: true, alreadyPro: true }; }
    if (e.name === "NoFreeTrial") { store.deleteAccounts([id]); log(`Pro tidak gratis (${e.price}) — dihapus`, "warn"); return { ok: false, error: "Pro tidak gratis — dihapus" }; }
    log(`Refetch gagal: ${e.message}`, "error");
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("domains:load", async (_e, { provider, creds, site }) => {
  try {
    return { ok: true, items: await providerDomains(provider, creds, site) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("provider:balance", (_e, { provider, creds }) => providerBalance(provider, creds));
ipcMain.handle("provider:checkDomain", async (_e, { provider, creds, domain }) => {
  try { return await providerCheckDomain(provider, creds, domain); }
  catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle("captcha:balance", (_e, { provider, creds }) => captchaBalance(provider, creds));
ipcMain.handle("adspower:status", async (_e, { creds }) => {
  try { return await adspowerStatus(creds); }
  catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle("system:info", async () => {
  const cpus = os.cpus();
  const cores = cpus.length;
  const freeGB = os.freemem() / 1073741824;
  const byCpu = Math.max(1, Math.floor(cores / 2));
  const byRam = Math.max(1, Math.floor(freeGB / 0.7));
  const recommended = Math.max(1, Math.min(byCpu, byRam, 12));
  const machineId = crypto
    .createHash("sha256")
    .update(os.hostname() + os.arch() + (cpus[0]?.model || ""))
    .digest("hex")
    .slice(0, 16)
    .toUpperCase();
  let net = {};
  try {
    const r = await fetch("http://ip-api.com/json/?fields=query,country,regionName,city,isp", { signal: AbortSignal.timeout(6000) });
    net = await r.json();
  } catch {}
  return {
    cpu: (cpus[0]?.model || "").trim(),
    cores, speed: cpus[0]?.speed,
    memTotal: os.totalmem() / 1073741824,
    memFree: freeGB,
    platform: os.platform(), arch: os.arch(), hostname: os.hostname(), machineId,
    ip: net.query || null,
    location: [net.city, net.regionName, net.country].filter(Boolean).join(", "),
    isp: net.isp || null,
    recommended,
  };
});

ipcMain.handle("system:ip", async () => {
  try {
    const r = await fetch("http://ip-api.com/json/?fields=query,country,regionName,city,isp", { signal: AbortSignal.timeout(6000) });
    const n = await r.json();
    return { ip: n.query || null, location: [n.city, n.regionName, n.country].filter(Boolean).join(", "), isp: n.isp || null };
  } catch {
    return {};
  }
});

// ---------- auto-update (GitHub Releases via electron-updater) ----------
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
const uSend = (payload) => win?.webContents.send("update:status", payload);
autoUpdater.on("checking-for-update", () => uSend({ state: "checking" }));
autoUpdater.on("update-available", (i) => uSend({ state: "available", version: i.version }));
autoUpdater.on("update-not-available", () => uSend({ state: "none" }));
autoUpdater.on("error", (e) => uSend({ state: "error", error: String(e?.message || e) }));
autoUpdater.on("download-progress", (p) => uSend({ state: "downloading", percent: Math.round(p.percent) }));
autoUpdater.on("update-downloaded", (i) => uSend({ state: "downloaded", version: i.version }));

ipcMain.handle("app:version", () => app.getVersion());
ipcMain.handle("update:check", async () => {
  if (!app.isPackaged) return { ok: false, error: "Update hanya di versi terpasang (installer)" };
  try { const r = await autoUpdater.checkForUpdates(); return { ok: true, version: r?.updateInfo?.version }; }
  catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle("update:download", () => autoUpdater.downloadUpdate().then(() => ({ ok: true })).catch((e) => ({ ok: false, error: e.message })));
ipcMain.handle("update:install", () => { autoUpdater.quitAndInstall(); });
