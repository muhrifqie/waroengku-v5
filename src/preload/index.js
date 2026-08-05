import { contextBridge, ipcRenderer } from "electron";

// Daftarkan listener & kembalikan fungsi unsubscribe (cegah listener dobel di StrictMode).
const on = (channel, cb) => {
  const h = (_e, ...a) => cb(...a);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
};

contextBridge.exposeInMainWorld("api", {
  minimize: () => ipcRenderer.send("win:minimize"),
  maximize: () => ipcRenderer.send("win:maximize"),
  close: () => ipcRenderer.send("win:close"),
  onWinState: (cb) => on("win:state", cb),

  checkSetup: () => ipcRenderer.invoke("setup:check"),
  installSetup: () => ipcRenderer.invoke("setup:install"),
  onSetupLog: (cb) => on("setup:log", cb),

  openExternal: (url) => ipcRenderer.send("open-external", url),
  getVersion: () => ipcRenderer.invoke("app:version"),
  checkUpdate: () => ipcRenderer.invoke("update:check"),
  downloadUpdate: () => ipcRenderer.invoke("update:download"),
  installUpdate: () => ipcRenderer.invoke("update:install"),
  onUpdateStatus: (cb) => on("update:status", cb),

  // database
  listAccounts: () => ipcRenderer.invoke("db:list"),
  deleteAccounts: (ids) => ipcRenderer.invoke("db:delete", ids),
  importLegacy: () => ipcRenderer.invoke("db:importLegacy"),
  compactDb: () => ipcRenderer.invoke("db:compact"),
  exportDb: () => ipcRenderer.invoke("db:export"),
  importDb: () => ipcRenderer.invoke("db:import"),
  openDbFolder: () => ipcRenderer.send("db:open-folder"),
  listProxies: () => ipcRenderer.invoke("proxy:list"),
  deleteProxies: (ids) => ipcRenderer.invoke("proxy:delete", ids),
  detectProxies: (lines) => ipcRenderer.invoke("proxy:detect", lines),
  listFolders: () => ipcRenderer.invoke("folders:list"),
  createFolder: (args) => ipcRenderer.invoke("folders:create", args),
  updateFolder: (args) => ipcRenderer.invoke("folders:update", args),
  deleteFolder: (args) => ipcRenderer.invoke("folders:delete", args),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (obj) => ipcRenderer.invoke("settings:set", obj),

  // bot
  startBot: (cfg) => ipcRenderer.invoke("bot:start", cfg),
  startOutlook: (cfg) => ipcRenderer.invoke("outlook:start", cfg),
  stopBot: () => ipcRenderer.send("bot:stop"),
  restoreSession: (id) => ipcRenderer.invoke("bot:restore", id),
  loadDomains: (args) => ipcRenderer.invoke("domains:load", args),
  providerBalance: (args) => ipcRenderer.invoke("provider:balance", args),
  checkDomain: (args) => ipcRenderer.invoke("provider:checkDomain", args),
  captchaBalance: (args) => ipcRenderer.invoke("captcha:balance", args),
  adspowerStatus: (args) => ipcRenderer.invoke("adspower:status", args),
  systemInfo: () => ipcRenderer.invoke("system:info"),
  reloadIp: () => ipcRenderer.invoke("system:ip"),
  onBotLog: (cb) => on("bot:log", cb),
  onBotProgress: (cb) => on("bot:progress", cb),
  onBotSaved: (cb) => on("bot:saved", cb),
});
