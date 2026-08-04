import { createContext, useContext, useEffect, useState } from "react";
import { defaultIntegrations } from "./providers.js";

const PROFILE_DEFAULTS = {
  site: "capcut.com", zone: "outlook.com",
  password: "masuk123", name: " X",
  year: "2000", month: "6", day: "15",
  count: "1", concurrent: "1", headless: false, useProxy: false,
  otpProvider: "litensi", captchaProvider: "capsolver", folder: "capcut",
};

function beep() {
  try {
    const a = new (window.AudioContext || window.webkitAudioContext)();
    const o = a.createOscillator(), g = a.createGain();
    o.connect(g); g.connect(a.destination);
    o.frequency.value = 880; g.gain.value = 0.12; o.start();
    setTimeout(() => { o.stop(); a.close(); }, 350);
  } catch {}
}

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const [cfg, setCfg] = useState(PROFILE_DEFAULTS);
  const [integrations, setIntegrations] = useState(() => {
    const d = defaultIntegrations();
    d.litensi = { ...d.litensi, apiId: "2598", apiKey: "s6yNHhz6gwvwBkQMXroxbccTyJRlg1Pp" };
    return d;
  });
  const [rows, setRows] = useState([]);
  const [logs, setLogs] = useState([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [termSignal, setTermSignal] = useState(0);
  const focusTerminal = () => setTermSignal((s) => s + 1);
  const [domains, setDomains] = useState([]);
  const [browserReady, setBrowserReady] = useState(true);
  const [litensiStatus, setLitensiStatus] = useState({ state: "idle" });
  const [loaded, setLoaded] = useState(false);
  const [sys, setSys] = useState(null);
  const [folders, setFolders] = useState([]);

  const pushLog = (p) => {
    if (p.level === "captcha") beep();
    setLogs((l) => [...l.slice(-600), { ...p, t: new Date().toLocaleTimeString("en-GB", { hour12: false }) }]);
  };
  const lit = integrations.litensi;

  const setField = (k, v) => setCfg((c) => ({ ...c, [k]: v }));
  const setIntegration = (id, patch) => {
    setIntegrations((s) => ({ ...s, [id]: { ...s[id], ...patch } }));
    if (id === "litensi") setLitensiStatus({ state: "idle" });
  };

  useEffect(() => {
    (async () => {
      const s = await window.api.getSettings();
      if (s.profile || s.config) setCfg((c) => ({ ...c, ...(s.profile || s.config) }));
      setIntegrations((prev) => {
        const next = { ...prev, ...(s.integrations || {}) };
        // migrasi kredensial litensi lama dari config
        if (!s.integrations && s.config?.apiKey)
          next.litensi = { ...next.litensi, apiId: s.config.apiId, apiKey: s.config.apiKey };
        return next;
      });
      const chk = await window.api.checkSetup();
      setBrowserReady(!!chk.browser);
      window.api.systemInfo().then(setSys);
      window.api.listFolders().then(setFolders);
      refresh();
      setLoaded(true);
    })();
    window.api.onBotLog(pushLog);
    window.api.onBotProgress((p) => setProgress(p));
    window.api.onBotSaved(() => refresh());
  }, []);

  useEffect(() => {
    if (loaded) window.api.setSettings({ profile: cfg, integrations });
  }, [cfg, integrations, loaded]);

  const refresh = async () => setRows(await window.api.listAccounts());

  const otpArgs = () => ({
    provider: cfg.otpProvider,
    creds: { ...(integrations[cfg.otpProvider] || {}) },
    site: cfg.site.trim(),
  });

  async function startBot() {
    setRunning(true);
    focusTerminal();
    setProgress({ done: 0, total: Number(cfg.count) || 1 });
    await window.api.startBot({
      product: cfg.folder || "capcut",
      provider: cfg.otpProvider,
      creds: { ...(integrations[cfg.otpProvider] || {}) },
      site: cfg.site.trim(), zone: cfg.zone.trim(),
      password: cfg.password, name: cfg.name,
      birthday: { year: cfg.year, month: cfg.month, day: cfg.day },
      count: cfg.count, concurrent: cfg.concurrent, headless: cfg.headless, useProxy: cfg.useProxy,
    });
    setRunning(false);
  }
  const stopBot = () => window.api.stopBot();

  async function startOutlook(count, useProxy) {
    setRunning(true);
    focusTerminal();
    setProgress({ done: 0, total: Number(count) || 1 });
    await window.api.startOutlook({
      creds: { ...(integrations.adspower || {}) },
      count, folder: "outlook", deleteProfile: false, useProxy: !!useProxy,
    });
    setRunning(false);
  }
  const compactDb = () => window.api.compactDb();

  async function loadDomains() {
    const r = await window.api.loadDomains(otpArgs());
    if (r.ok) {
      setDomains(r.items);
      if (r.items[0]) setField("zone", r.items[0].zone);
    }
    return r;
  }

  async function validate(providerId) {
    const id = providerId || cfg.otpProvider;
    setLitensiStatus({ state: "checking" });
    const r = await window.api.providerBalance({ provider: id, creds: { ...(integrations[id] || {}) } });
    if (r.ok) setLitensiStatus({ state: "ok", msg: r.info || "Valid" });
    else setLitensiStatus({ state: "bad", msg: r.error });
    return r;
  }
  const captchaBalance = (id) =>
    window.api.captchaBalance({ provider: id, creds: { ...(integrations[id] || {}) } });
  const checkProvider = (id) =>
    window.api.providerBalance({ provider: id, creds: { ...(integrations[id] || {}) } });
  const checkAdspower = (id) =>
    window.api.adspowerStatus({ creds: { ...(integrations[id] || {}) } });
  const checkDomain = (domain) =>
    window.api.checkDomain({ provider: cfg.otpProvider, creds: { ...(integrations[cfg.otpProvider] || {}) }, domain });
  async function reloadIp() {
    const net = await window.api.reloadIp();
    setSys((s) => ({ ...(s || {}), ...net }));
  }
  const createFolder = async (name, icon) => { setFolders(await window.api.createFolder({ name, icon })); };
  const updateFolder = async (key, name, icon) => { setFolders(await window.api.updateFolder({ key, name, icon })); };
  const deleteFolder = async (key, reassignTo) => { setFolders(await window.api.deleteFolder({ key, reassignTo })); await refresh(); };

  function restore(ids) {
    focusTerminal();
    ids.forEach((id) => window.api.restoreSession(id));
  }
  async function del(ids) {
    setRows(await window.api.deleteAccounts(ids));
  }
  async function importLegacy() {
    focusTerminal();
    const r = await window.api.importLegacy();
    if (r?.ok) { pushLog({ line: `Imported ${r.count} accounts from legacy DB`, level: "success" }); refresh(); }
    else if (r) pushLog({ line: "Import cancelled or failed", level: "warn" });
    return r;
  }

  const value = {
    cfg, setField, integrations, setIntegration,
    rows, refresh, logs, clearLogs: () => setLogs([]),
    running, progress, termSignal, focusTerminal, domains, browserReady, litensiStatus, sys, reloadIp,
    folders, createFolder, updateFolder, deleteFolder,
    startBot, startOutlook, stopBot, compactDb, loadDomains, validate, captchaBalance, checkProvider, checkAdspower, checkDomain, restore, del, importLegacy,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
