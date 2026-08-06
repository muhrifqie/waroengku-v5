import { createContext, useContext, useEffect, useRef, useState } from "react";
import { defaultIntegrations } from "./providers.js";

const PROFILE_DEFAULTS = {
  site: "capcut.com", zone: "Random Domain",
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
  const [running, setRunning] = useState(false); // create (CapCut/Canva/Outlook)
  const [paying, setPaying] = useState(false);    // auto payment — independen dari create
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [payProgress, setPayProgress] = useState({ done: 0, total: 0 });
  const [payQr, setPayQr] = useState({}); // {id: {dataUri, expire, status, message}}
  const clearPayQr = () => setPayQr({});
  const dismissPayQr = (id) => setPayQr((s) => { const n = { ...s }; delete n[id]; return n; }); // tutup satu kartu QR
  const [termSignal, setTermSignal] = useState(0);
  const focusTerminal = () => setTermSignal((s) => s + 1);
  const [domains, setDomains] = useState([]);
  const [browserReady, setBrowserReady] = useState(true);
  const [litensiStatus, setLitensiStatus] = useState({ state: "idle" });
  const [loaded, setLoaded] = useState(false);
  const [sys, setSys] = useState(null);
  const [folders, setFolders] = useState([]);

  // Batch log: banyak worker bisa membanjiri log → kumpulkan lalu render 1x tiap ~120ms biar UI tak nge-lag.
  const logBuf = useRef([]);
  const logTimer = useRef(null);
  const pushLog = (p) => {
    if (p.level === "captcha") beep();
    logBuf.current.push({ ...p, t: new Date().toLocaleTimeString("en-GB", { hour12: false }) });
    if (!logTimer.current) logTimer.current = setTimeout(() => {
      logTimer.current = null;
      const buf = logBuf.current; logBuf.current = [];
      setLogs((l) => [...l, ...buf].slice(-600));
    }, 120);
  };
  const lit = integrations.litensi;

  // Selesaikan run: matikan status grup terkait + kabari lewat notifikasi desktop.
  function finishRun(res, label, group = "create") {
    (group === "payment" ? setPaying : setRunning)(false);
    window.api.notify?.(`${label} selesai`, `${res?.ok ?? 0}/${res?.total ?? 0} berhasil`);
  }

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
    const offs = [
      window.api.onBotLog(pushLog),
      window.api.onBotProgress((p) => (p.group === "payment" ? setPayProgress : setProgress)(p)),
      window.api.onBotSaved(() => scheduleRefresh()),
      window.api.onPayQr((p) => setPayQr((s) => ({ ...s, [p.id]: { ...s[p.id], dataUri: p.dataUri, expire: p.expire, status: "qr" } }))),
      window.api.onPayStatus((p) => { setPayQr((s) => ({ ...s, [p.id]: { ...s[p.id], status: p.status, message: p.message } })); if (p.status !== "qr") scheduleRefresh(); }),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => window.api.setSettings({ profile: cfg, integrations }), 400); // debounce tulis ke disk saat ketik
    return () => clearTimeout(t);
  }, [cfg, integrations, loaded]);

  const refresh = async () => setRows(await window.api.listAccounts());
  // refresh yg di-debounce untuk event beruntun (akun tersimpan / status bayar) → hindari banjir query DB.
  const refreshTimer = useRef(null);
  const scheduleRefresh = () => {
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => { refreshTimer.current = null; refresh(); }, 400);
  };

  const otpArgs = () => ({
    provider: cfg.otpProvider,
    creds: { ...(integrations[cfg.otpProvider] || {}) },
    site: cfg.site.trim(),
  });

  async function startBot(region = "id", proxies = null) {
    const vn = region === "vn";
    // VN: 1 proxy = 1 akun, jalan sampai proxy habis; paralel = jumlah proxy (maks 20).
    const count = vn ? (proxies?.length || 0) : (Number(cfg.count) || 1);
    // VN: paralel manual (cfg.concurrent), dibatasi jumlah proxy biar tak ada worker nganggur
    const concurrent = vn ? Math.min(Math.max(1, Number(cfg.concurrent) || 1), proxies?.length || 1) : cfg.concurrent;
    setRunning(true);
    focusTerminal();
    setProgress({ done: 0, total: count });
    const res = await window.api.startBot({
      product: vn ? "capcut-vn" : (cfg.folder || "capcut"),
      provider: cfg.otpProvider,
      creds: { ...(integrations[cfg.otpProvider] || {}) },
      site: cfg.site.trim(), zone: cfg.zone.trim(),
      password: cfg.password, name: cfg.name,
      birthday: { year: cfg.year, month: cfg.month, day: cfg.day },
      count, concurrent, headless: cfg.headless,
      region, useProxy: vn ? true : cfg.useProxy, // VN wajib lewat proxy SOCKS5
      proxies: proxies?.length ? proxies : undefined, // daftar proxy eksplisit (mis. VN tervalidasi)
    });
    finishRun(res, vn ? "CapCut VN" : "CapCut ID");
  }
  // Stop per-grup: "create" (default) atau "payment" — langsung nonaktifkan UI grup itu, backend tutup paksa browsernya.
  const stopBot = (group = "create") => { window.api.stopBot(group); (group === "payment" ? setPaying : setRunning)(false); };

  async function startPayment(ids, headless, proxyMode) {
    setPaying(true); // grup payment — tak menyentuh status create
    focusTerminal();
    setPayProgress({ done: 0, total: ids.length });
    const res = await window.api.startPayment({ ids, headless, proxyMode });
    finishRun(res, "Auto Payment", "payment");
    refresh();
  }

  async function startCanva(count, useProxy) {
    const n = Number(count) || 1;
    const c = Math.min(n, Math.max(1, Number(cfg.concurrent) || 1));
    setRunning(true);
    focusTerminal();
    setProgress({ done: 0, total: n });
    const res = await window.api.startCanva({
      product: "canva",
      provider: cfg.otpProvider,
      creds: { ...(integrations[cfg.otpProvider] || {}) },
      site: "canva.com", zone: (cfg.zone || "").trim(),
      password: cfg.password,
      count: n, concurrent: c, headless: cfg.headless, useProxy: !!useProxy,
    });
    finishRun(res, "Canva");
  }

  async function startOutlook(count, useProxy) {
    setRunning(true);
    focusTerminal();
    setProgress({ done: 0, total: Number(count) || 1 });
    const res = await window.api.startOutlook({
      creds: { ...(integrations.adspower || {}) },
      count, folder: "outlook", deleteProfile: false, useProxy: !!useProxy,
    });
    finishRun(res, "Outlook");
  }
  const compactDb = () => window.api.compactDb();
  const exportDb = () => window.api.exportDb();
  async function importDb() {
    const r = await window.api.importDb();
    if (r?.ok) { await refresh(); setFolders(await window.api.listFolders()); }
    return r;
  }

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
  const checkCliproxy = (id) => window.api.cliproxyInfo({ ...(integrations[id] || {}) });
  const fetchCliproxy = (num) => window.api.cliproxyFetch({ creds: { ...(integrations.cliproxy || {}) }, num, country: "VN" });

  // DataImpulse: gateway tunggal, negara dipilih via suffix username __cr.<cc>.
  // Buat N sesi (username sama, rotating gateway → tiap koneksi IP beda) untuk paralel.
  function dataimpulseProxies(count = 1, country = "vn") {
    const url = (integrations.dataimpulse?.proxy || "").trim();
    const m = url.match(/^https?:\/\/([^:@]+):([^@]+)@([^:@]+):(\d+)$/);
    if (!m) return { ok: false, error: "Format harus http://user:pass@gw.dataimpulse.com:823" };
    const [, user, pass, host, port] = m;
    const username = `${user}__cr.${country}`;
    const proxies = Array.from({ length: Math.max(1, count) }, (_, i) => ({
      scheme: "http", host, port: Number(port), username, password: pass,
      raw: `http://${username}:${pass}@${host}:${port}`, country: country.toUpperCase(), ip: null, sid: i + 1,
    }));
    return { ok: true, proxies };
  }
  async function checkDataimpulse() {
    const gen = dataimpulseProxies(1, "vn");
    if (!gen.ok) return gen;
    const { results } = await window.api.detectProxies([gen.proxies[0].raw]);
    const r = results?.[0];
    return r?.ok ? { ok: true, info: `VN OK · exit ${r.ip} (${r.country})` } : { ok: false, error: "Proxy tidak merespon" };
  }
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
  async function refetchLink(id) {
    focusTerminal();
    const r = await window.api.refetchLink(id);
    if (r?.ok) refresh();
    return r;
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
    running, paying, progress, payProgress, payQr, clearPayQr, dismissPayQr, termSignal, focusTerminal, domains, browserReady, litensiStatus, sys, reloadIp,
    folders, createFolder, updateFolder, deleteFolder,
    startBot, startOutlook, startCanva, startPayment, stopBot, compactDb, exportDb, importDb, loadDomains, validate, captchaBalance, checkProvider, checkAdspower, checkCliproxy, fetchCliproxy, dataimpulseProxies, checkDataimpulse, checkDomain, restore, refetchLink, del, importLegacy,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
