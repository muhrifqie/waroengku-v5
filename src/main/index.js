import { app, BrowserWindow, ipcMain, shell, dialog } from "electron";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import icon from "../../resources/icon.png?asset";
import * as store from "./db.js";
import os from "node:os";
import crypto from "node:crypto";
import { runBatch, restoreSession } from "./bot.js";
import { providerDomains, providerBalance, providerCheckDomain } from "./otp.js";
import { captchaBalance } from "./captcha.js";
import { adspowerStatus } from "./adspower.js";
import { runOutlookBatch } from "./outlookbot.js";
import { detectMany } from "./proxy.js";
import electronUpdater from "electron-updater";
const { autoUpdater } = electronUpdater;

let stopFlag = false;

// Cegah instance ganda (penyebab "Unable to move the cache: Access is denied")
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
}
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");

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
    width: 1120,
    height: 760,
    minWidth: 940,
    minHeight: 640,
    frame: false,
    backgroundColor: "#1f1f1e",
    icon,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: false,
    },
  });

  win.on("maximize", () => win.webContents.send("win:state", true));
  win.on("unmaximize", () => win.webContents.send("win:state", false));

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

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

// ---------- setup IPC ----------
ipcMain.handle("setup:check", () => ({
  node: process.versions.node,
  electron: process.versions.electron,
  deps: depsInstalled(),
  browser: fs.existsSync(CAMOUFOX_EXE),
}));

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

  send("Semua kebutuhan terpenuhi 🎉", "ok");
  return { ok: true };
});

ipcMain.on("open-external", (_e, url) => shell.openExternal(url));

// ---------- database IPC ----------
ipcMain.handle("db:list", () => store.listAccounts());
ipcMain.handle("db:delete", (_e, ids) => (store.deleteAccounts(ids), store.listAccounts()));
ipcMain.handle("db:importLegacy", async () => {
  const guess = path.join(__dirname, "../../../accounts.db");
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
function makeHooks(evt) {
  const send = (ch, payload) => evt.sender.send(ch, payload);
  return {
    log: (line, level = "info", tag) => {
      if (level === "captcha" && win) { win.flashFrame(true); win.show(); }
      send("bot:log", { line, level, tag });
    },
    progress: (done, total) => send("bot:progress", { done, total }),
    saved: (acc) => { store.saveAccount(acc); send("bot:saved", acc); },
  };
}
function withProxies(cfg) {
  if (cfg.useProxy) cfg.proxies = store.randomProxies();
  return cfg;
}

ipcMain.handle("bot:start", (evt, cfg) => { stopFlag = false; return runBatch(withProxies(cfg), makeHooks(evt), () => stopFlag); });
ipcMain.on("bot:stop", () => (stopFlag = true));
ipcMain.handle("outlook:start", (evt, cfg) => { stopFlag = false; return runOutlookBatch(withProxies(cfg), makeHooks(evt), () => stopFlag); });

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
