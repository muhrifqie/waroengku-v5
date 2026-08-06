import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createOtp } from "./otp.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => Math.floor(a + Math.random() * (b - a));
const getCamoufox = async () => (await import("camoufox-js")).Camoufox;

// Firefox (Playwright) TIDAK mendukung SOCKS5 dengan autentikasi. Solusi: relay HTTP lokal
// tanpa-auth di 127.0.0.1 yang meneruskan ke SOCKS5 upstream (pakai kredensial) via CONNECT.
async function startSocksRelay(p) {
  const http = await import("node:http");
  const { SocksClient } = await import("socks");
  const proxy = { host: p.host, port: Number(p.port), type: p.scheme === "socks4" ? 4 : 5,
    userId: p.username || undefined, password: p.password || undefined };
  const server = http.createServer((_req, res) => res.end()); // http polos tak dipakai (situs pakai https/CONNECT)
  server.on("connect", async (req, client, head) => {
    const i = req.url.lastIndexOf(":");
    const host = req.url.slice(0, i), port = Number(req.url.slice(i + 1));
    try {
      const { socket } = await SocksClient.createConnection({ proxy, command: "connect", destination: { host, port } });
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head?.length) socket.write(head);
      socket.pipe(client); client.pipe(socket);
      const kill = () => { socket.destroy(); client.destroy(); };
      socket.on("error", kill); client.on("error", kill); client.on("close", () => socket.destroy());
    } catch { client.destroy(); }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

// Bangun opsi launch Camoufox sendiri + kelola relay SOCKS. geoip dilewatkan proxy yang sama
// (relay lokal) sehingga IP publik yang terdeteksi tetap IP exit proxy (mis. Vietnam).
async function launchCamoufox({ headless, p, group = "create" }) {
  const { launchOptions } = await import("camoufox-js");
  const { firefox } = await import("playwright-core");
  let relay = null, proxy;
  if (p && /^socks/i.test(p.scheme || "")) {
    relay = await startSocksRelay(p);
    proxy = { server: relay.url };
  } else if (p) {
    proxy = { server: `${p.scheme === "https" ? "http" : p.scheme || "http"}://${p.host}:${p.port}`,
      username: p.username || undefined, password: p.password || undefined };
  }
  // geoip fetch (IP publik via proxy) kadang gagal sesaat kalau proxy sibuk → retry beberapa kali
  let built, lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { built = await launchOptions({ headless, proxy, geoip: !!proxy }); break; }
    catch (e) { lastErr = e; await sleep(1500); }
  }
  if (!built) { relay?.close(); throw lastErr; }
  const browser = await firefox.launch(built);
  const entry = { browser, relay };
  const set = ACTIVE[group] || ACTIVE.create;
  set.add(entry);
  return { browser, cleanup: () => { set.delete(entry); relay?.close(); } };
}

// Registry browser aktif per grup (create / payment) → Stop bisa tutup paksa hanya grup terkait.
const ACTIVE = { create: new Set(), payment: new Set() };
export function stopAll(group) {
  const sets = group ? [ACTIVE[group]].filter(Boolean) : Object.values(ACTIVE);
  for (const set of sets) {
    for (const e of set) {
      try { e.browser.close().catch(() => {}); } catch {}
      try { e.relay?.close(); } catch {}
    }
    set.clear();
  }
}
// Daftarkan browser eksternal (mis. AdsPower CDP) agar ikut ditutup paksa saat Stop. Return fn untuk melepas.
export function trackBrowser(browser, group = "create") {
  const set = ACTIVE[group] || ACTIVE.create;
  const entry = { browser, relay: null };
  set.add(entry);
  return () => set.delete(entry);
}
// Pro masih gratis (trial 7 hari)? "0₫trong 7 ngày" = gratis, "222000₫/tháng" = berbayar.
function isFreeTrial(price) {
  const p = (price || "").trim().toLowerCase();
  return /^0|miễn phí|free|7\s*ngày|trong 7/.test(p);
}
class NoFreeTrial extends Error { constructor(price) { super("Pro tidak gratis lagi"); this.name = "NoFreeTrial"; this.price = price; } }
class AlreadyPro extends Error { constructor() { super("Sudah Pro"); this.name = "AlreadyPro"; } }
// Sudah langganan Pro? dari response user_info (network) — flag aktif + level vip.
function isProInfo(info) {
  const d = info?.data || {};
  return d.flag === true && (d.cur_vip_level === "vip" || (Array.isArray(d.vip_levels) && d.vip_levels.length > 0));
}
const clean = (s) => String(s).replace(/\[[0-9;]*m/g, "").split("\n")[0].trim();

// ---------------------------------------------------------------- CapCut
class CapCut {
  constructor(cfg, otp, log) {
    this.cfg = cfg;
    this.otp = otp;
    this.log = log;
    this.email = null;
    this.orderId = null;
    this.prices = {};
    this.cookiesJson = null;
    this.checkoutLink = null;
    this.userInfo = null; // response user_info (dipantau saat sesi terbuka)
  }

  async orderEmail() {
    this.log(`Requesting email from ${this.cfg.provider}`);
    const { id, email } = await this.otp.orderEmail(this.cfg.site, this.cfg.zone || null);
    this.orderId = id;
    this.email = email;
    this.log(`Email ready: ${this.email} (order #${this.orderId})`);
  }

  async _safeClick(page, sel, label, timeout = 15000) {
    await page.waitForSelector(sel, { state: "attached", timeout });
    const loc = page.locator(sel).first();
    try {
      await loc.click({ timeout: 5000 });
      this.log(label);
      return;
    } catch {}
    try {
      await loc.click({ force: true, timeout: 5000 });
      this.log(`${label} (force)`);
      return;
    } catch {}
    const el = await page.$(sel);
    if (el) {
      await page.evaluate((e) => e.click(), el);
      this.log(label);
      return;
    }
    throw new Error(`Click failed: ${sel}`);
  }

  async _selectArco(page, locator, index) {
    await locator.click();
    await page
      .locator(".lv-select-popup-inner:visible .lv-select-option")
      .first()
      .waitFor({ state: "visible", timeout: 2500 });
    for (let i = 0; i < index; i++) {
      await page.keyboard.press("ArrowDown");
      await page.waitForTimeout(60);
    }
    await page.keyboard.press("Enter");
  }

  async _fillBirthday(page) {
    const bd = this.cfg.birthday;
    await page.waitForSelector(".gate_birthday-picker-input");
    await page.fill(".gate_birthday-picker-input", String(bd.year));
    await page.waitForTimeout(300);
    const sels = page.locator(".gate_birthday-picker-selector");
    await this._selectArco(page, sels.nth(0), Number(bd.month) - 1);
    await this._selectArco(page, sels.nth(1), Number(bd.day) - 1);
    this.log(`Birthday set to ${bd.day}/${bd.month}/${bd.year}`);
  }

  async _getOtp() {
    this.log("Waiting for OTP");
    const code = await this.otp.waitOtp(this.orderId, 180);
    if (!code) throw new Error("OTP not received");
    return code;
  }

  // Pasang penyapu modal di latar belakang: terus tutup survey ("Bỏ qua") & popup what's-new
  // (.lv-modal-close-icon) yg nutupin tombol, TAPI jangan sentuh modal langganan/checkout.
  async _installModalSweeper(page) {
    await page.evaluate(() => {
      if (window.__sweep) return;
      const vis = (el) => {
        if (!el) return false;
        const s = getComputedStyle(el), r = el.getBoundingClientRect();
        return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0;
      };
      const inPricing = (el) => el.closest(".subscriptionModal-sections, [class*='subscriptionProduct'], [class*='subscriptionModal']");
      const sweep = () => {
        document.querySelectorAll(".skip-mrkR37").forEach((el) => vis(el) && el.click());
        document.querySelectorAll(".operation-features-modal .lv-modal-close-icon").forEach((el) => vis(el) && el.click());
        document.querySelectorAll(".lv-modal-close-icon").forEach((el) => vis(el) && !inPricing(el) && el.click());
      };
      window.__sweep = setInterval(sweep, 500);
      sweep();
    });
  }

  async _dismissModals(page, seconds = 25) {
    const js = `() => {
      const vis = el => {
        if (!el) return false;
        const s = getComputedStyle(el), r = el.getBoundingClientRect();
        return s.display!=='none' && s.visibility!=='hidden' && r.width>0 && r.height>0;
      };
      if (document.querySelector('.subscriptionModal-sections')) return 'pricing';
      const skip = [...document.querySelectorAll('.skip-mrkR37')].find(vis);
      if (skip) { skip.click(); return 'Survey (Skip)'; }
      const close = [...document.querySelectorAll('.lv-modal-close-icon')].find(vis);
      if (close) { close.click(); return 'Popup (Close)'; }
      return '';
    }`;
    this.log("Dismissing popups");
    const deadline = Date.now() + seconds * 1000;
    let clean = 0, closed = 0;
    while (Date.now() < deadline && clean < 2) {
      const what = await page.evaluate(js);
      if (what === "pricing") break;
      if (what) {
        closed++;
        this.log(`Popup dismissed: ${what}`);
        clean = 0;
        await page.waitForTimeout(800);
      } else {
        clean++;
        await page.waitForTimeout(600);
      }
    }
    this.log(`Popups cleared (${closed} dismissed)`);
  }

  async _openPricing(page) {
    this.log("Opening pricing (Upgrade)");
    const clickUpgrade = () => page.evaluate(() => {
      const sels = [".LvHeaderUpgradeVipNew", "[data-id='TitleBarUpgradeVip'] .upgrade-text",
        "[data-id='TitleBarUpgradeVip'] button.credit-section", "[data-id='TitleBarUpgradeVip']"];
      for (const s of sels) { const el = document.querySelector(s); if (el) { el.click(); return true; } }
      // fallback teks: Upgrade / Nâng cấp (VN)
      const t = [...document.querySelectorAll("button, a, div")]
        .find((e) => /^(upgrade|nâng cấp)$/i.test((e.textContent || "").trim()) && e.getBoundingClientRect().width > 0);
      if (t) { t.click(); return true; }
      return false;
    });
    // retry: popup kadang menutupi tombol / modal telat muncul
    for (let attempt = 1; attempt <= 4; attempt++) {
      await clickUpgrade();
      try {
        await page.waitForSelector(".subscriptionModal-sections", { timeout: 6000 });
        break;
      } catch {
        if (attempt === 4) throw new Error("Pricing modal did not open");
        await page.waitForTimeout(800);
      }
    }
    this.log("Pricing modal opened");
    const prices = await page.evaluate(() => {
      const out = {};
      document.querySelectorAll(".subscriptionProductSection").forEach((sec) => {
        const t = sec.querySelector(".subscriptionProductSection-title");
        const p = sec.querySelector(".subscriptionProductSection-price");
        const s = sec.querySelector(".subscriptionProductSection-priceSuffix");
        if (t && p)
          out[t.textContent.trim()] =
            (p.textContent.trim() + (s ? s.textContent.trim() : "")).trim();
      });
      return out;
    });
    for (const [plan, price] of Object.entries(prices)) this.log(`Plan ${plan}: ${price}`);
    return prices;
  }

  async _flow(page, context) {
    this.log("Login page ready");
    await this._safeClick(
      page,
      ".lv_third_part_sign_in_expand_new-button:has(.lv_third_part_sign_in_expand-icon-email)",
      "Selected continue with email"
    );
    await page.waitForSelector("input[name='username']");
    await page.fill("input[name='username']", this.email);
    await page.waitForTimeout(300);
    await this._safeClick(page, ".lv_email_entry_view-btn", "Email entered");

    await page.waitForSelector("input[name='password']");
    await page.fill("input[name='password']", this.cfg.password);
    await page.waitForTimeout(200);
    await this._safeClick(page, ".lv_sign_in_panel_wide-sign-in-button", "Password entered");

    await this._fillBirthday(page);
    await this._safeClick(page, ".lv_sign_in_panel_wide-birthday-next", "Birthday submitted");

    await page.waitForSelector(".lv_sign_in_panel_wide-code-input-wrapper input");
    const otp = await this._getOtp();
    const code = page.locator(".lv_sign_in_panel_wide-code-input-wrapper input");
    await code.click();
    await code.type(otp, { delay: 100 });
    this.log(`OTP entered: ${otp}`);

    await page.waitForSelector("#name_input");
    await page.fill("#name_input", this.cfg.name);
    this.log("Profile name filled");

    await page.click("#create-bottom");
    this.log("Account submitted, opening CapCut");

    this.log("Waiting for workspace redirect");
    const deadline = Date.now() + 120000;
    while (!page.url().includes("my-edit")) {
      if (Date.now() > deadline) throw new Error("Workspace did not open within 120s");
      await page.waitForTimeout(3000);
    }
    this.log("Workspace loaded");

    this.log("Navigating to recent list");
    await page.goto(
      "https://www.capcut.com/recent-list?enter_from=page_header&from_page=work_space",
      { waitUntil: "domcontentloaded" }
    );

    await this._installModalSweeper(page);
    await this._dismissModals(page);
    const state = await context.storageState();
    // pangkas: cookies penuh, localStorage cuma origin capcut/bytedance (buang ad/analytics yg bikin bengkak)
    state.origins = (state.origins || []).filter((o) => /capcut|byteoversea|ibyteimg|bytedance|tiktok/i.test(o.origin || ""));
    this.cookiesJson = JSON.stringify(state);
    this.log("Login session saved");

    if (this.cfg.region === "vn") {
      await this._vnClaimPro(page, context);
    } else {
      try {
        this.prices = await this._openPricing(page);
      } catch (e) {
        this.log(`Pricing skipped: ${clean(e.message)}`, "warn");
      }
    }
  }

  // Tunggu URL popup checkout sampai final: cocok pola cashier/pipopay + berhenti berubah.
  async _waitCheckoutUrl(popup, timeout = 60000) {
    const end = Date.now() + timeout;
    let last = "", stableSince = Date.now();
    while (Date.now() < end) {
      let u;
      try { u = popup.url(); } catch { break; } // popup ditutup
      if (u !== last) { last = u; stableSince = Date.now(); }
      const looksFinal = /pipopay|cashier|checkout|agreement|payin/i.test(u) && u.includes("?");
      if (looksFinal && Date.now() - stableSince >= 2000) return u;
      await popup.waitForTimeout(400).catch(() => {});
    }
    return last || popup.url();
  }

  // VN: buka checkout, pilih plan Pro gratis, tangkap popup baru + simpan link-nya.
  async _vnClaimPro(page, context) {
    this.prices = await this._openPricing(page); // buka modal langganan + ambil harga
    for (let i = 0; i < 12 && !this.userInfo; i++) await page.waitForTimeout(300); // tunggu user_info tertangkap
    if (isProInfo(this.userInfo)) throw new AlreadyPro(); // sudah langganan Pro → jangan bayar lagi
    const pro = this.prices.Pro || this.prices.pro || "";
    if (!isFreeTrial(pro)) throw new NoFreeTrial(pro); // Pro tak gratis & bukan Pro → skip/hapus

    // Klik tombol "Upgrade" (.subscriptionProductSection-action) di kartu plan "Pro".
    // Popup baru (window.open) → tangkap lewat page event.
    const clickPro = () => page.evaluate(() => {
      const title = (s) => (s.querySelector(".subscriptionProductSection-title")?.textContent || "").trim();
      const secs = [...document.querySelectorAll(".subscriptionProductSection")];
      const pro = secs.find((s) => title(s).toLowerCase() === "pro") || secs.find((s) => /pro/i.test(title(s)));
      const btn = pro?.querySelector(".subscriptionProductSection-action") || pro?.querySelector("button");
      if (!btn) return false;
      btn.click();
      return true;
    });

    this.log("Selecting free Pro plan");
    const [popup, ok] = await Promise.all([
      context.waitForEvent("page", { timeout: 30000 }).catch(() => null),
      clickPro(),
    ]);
    if (!ok) throw new Error("Pro plan button not found");
    if (!popup) throw new Error("Checkout popup did not open");

    this.log("Waiting for checkout URL to finalize");
    this.checkoutLink = await this._waitCheckoutUrl(popup);
    this.log(`Pipopay link saved: ${this.checkoutLink}`, "success");
    await popup.close().catch(() => {});
  }

  async run() {
    this.log("Starting CapCut registration");
    await this.orderEmail();
    const p = this.cfg.proxy;
    if (p) this.log(`Using proxy ${p.host}:${p.port} (${p.scheme})`);
    // geoip:true → samakan timezone/locale/geolokasi ke IP proxy (penting utk VN)
    const { browser, cleanup } = await launchCamoufox({ headless: this.cfg.headless, p, group: this.cfg.group });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto("https://www.capcut.com/login", { waitUntil: "domcontentloaded" });
      await this._flow(page, context);
    } finally {
      await browser.close();
      cleanup();
      await this.otp.cancel(this.orderId);
    }
    return {
      email: this.email,
      password: this.cfg.password,
      prices: this.prices,
      checkoutLink: this.checkoutLink,
      cookiesJson: this.cookiesJson,
    };
  }
}

export async function restoreSession(cookiesJson, log) {
  const tmp = path.join(os.tmpdir(), `capcut-session-${Date.now()}.json`);
  fs.writeFileSync(tmp, cookiesJson, "utf-8");
  log?.("Opening saved session");
  const Camoufox = await getCamoufox();
  const browser = await Camoufox({ headless: false });
  try {
    const context = await browser.newContext({ storageState: tmp });
    const page = await context.newPage();
    await page.goto("https://www.capcut.com/my-edit", { waitUntil: "domcontentloaded" });
    log?.("Session opened — close the browser window when done");
    while (context.pages().length) await page.waitForTimeout(1000).catch(() => {});
  } finally {
    await browser.close().catch(() => {});
    fs.rmSync(tmp, { force: true });
  }
}

// Ambil ulang link Pipopay: login lewat sesi tersimpan + proxy (VN), buka checkout Pro lagi,
// tangkap link baru. Dipakai saat link lama kedaluwarsa. Reuse method VN dari class CapCut.
export async function refetchLink(cookiesJson, proxy, log, headless = true, group = "create") {
  const tmp = path.join(os.tmpdir(), `capcut-refetch-${Date.now()}.json`);
  fs.writeFileSync(tmp, cookiesJson, "utf-8");
  if (proxy) log?.(`Using proxy ${proxy.host}:${proxy.port} (${proxy.scheme})`);
  const { browser, cleanup } = await launchCamoufox({ headless, p: proxy, group });
  try {
    const context = await browser.newContext({ storageState: tmp });
    const page = await context.newPage();
    log?.("Opening saved session");
    const bot = new CapCut({ region: "vn", proxy }, null, log || (() => {}));
    // pantau traffic: tangkap response user_info (deteksi akun sudah Pro)
    page.on("response", async (res) => {
      if (bot.userInfo || !/subscription\/user_info/i.test(res.url())) return;
      try { bot.userInfo = await res.json(); } catch {}
    });
    await page.goto("https://www.capcut.com/recent-list?enter_from=page_header&from_page=work_space", { waitUntil: "domcontentloaded" });
    await bot._installModalSweeper(page);
    await bot._vnClaimPro(page, context);
    return bot.checkoutLink;
  } finally {
    await browser.close().catch(() => {});
    cleanup();
    fs.rmSync(tmp, { force: true });
  }
}

// VN: tiap proxy bikin akun terus-menerus sampai "habis" (gagal beruntun), lalu ambil proxy berikut.
// Paralel dibatasi 20; semua proxy dipakai sampai kering. Berhenti saat semua proxy habis / di-stop.
async function runVnUntilExhausted(cfg, hooks, shouldStop) {
  const queue = [...cfg.proxies];
  const workers = Math.min(queue.length, Math.max(1, Number(cfg.concurrent) || queue.length)); // paralel manual; default = semua proxy
  const MAX_FAIL = 3; // gagal beruntun sebelum proxy dianggap habis
  let ok = 0, done = 0, seq = 0;

  async function worker(wid) {
    while (!shouldStop()) {
      const proxy = queue.shift();
      if (!proxy) return;
      hooks.log(`Proxy ${proxy.host}:${proxy.port} — mulai`, "step", `P${wid}`);
      let fails = 0;
      while (!shouldStop() && fails < MAX_FAIL) {
        const tag = `#${++seq}`;
        const alog = (msg, level = "info") => hooks.log(msg, level, tag);
        try {
          const bot = new CapCut({ ...cfg, proxy }, createOtp(cfg.provider, cfg.creds), alog);
          const res = await bot.run();
          hooks.saved({ ...res, product: cfg.product || "capcut-vn" });
          alog(`Account created: ${res.email}`, "success");
          ok++; fails = 0;
        } catch (e) {
          fails++;
          if (!shouldStop()) alog(`Failed (${fails}/${MAX_FAIL}): ${clean(e.message)}`, "error");
        }
        hooks.progress(++done, 0); // total 0 → progress taskbar indeterminate (tak terbatas)
      }
      if (!shouldStop()) {
        hooks.log(`Proxy ${proxy.host}:${proxy.port} — habis, dihapus`, "warn", `P${wid}`);
        hooks.proxyDead?.(proxy); // proxy sekali pakai → buang dari pool
      }
    }
  }

  await Promise.all(Array.from({ length: workers }, (_, i) => worker(i + 1)));
  hooks.log(`${shouldStop() ? "Stopped" : "Finished"} — ${ok} akun dibuat`, ok ? "success" : "warn");
  return { ok, total: ok };
}

// ---------------------------------------------------------------- Auto Payment
// Buka link Pipopay yg sudah didapat; kalau rusak/expired → ambil ulang via sesi + proxy,
// lalu jalankan langkah pembayaran. (Langkah pembayaran masih placeholder — menunggu detail.)
async function selectMomo(page, alog) {
  const card = page.locator(".ds-common-elements-payment-method-list").filter({ hasText: "MoMo" }).first();
  await card.waitFor({ state: "visible", timeout: 30000 });
  const selected = async () =>
    ((await card.getAttribute("class").catch(() => "")) || "").includes("pipo-card-focused") ||
    (await card.locator(".pipo-radio-checked").count().catch(() => 0)) > 0;
  for (let i = 0; i < 5; i++) {
    if (await selected()) { alog("MoMo dipilih"); return; }
    // klik area kartu / radio (bukan input langsung, agar event framework kepicu)
    await card.locator("label.pipo-radio, .pipo-list-item-main").first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);
  }
  if (await selected()) { alog("MoMo dipilih"); return; }
  throw new Error("Gagal memilih MoMo");
}

async function clickPay(page, alog) {
  // tombol bayar baru muncul setelah MoMo terpilih (di kartu terfokus)
  await page.waitForSelector(".pipo-card-focused .pay-button, .pay-button", { timeout: 15000 }).catch(() => {});
  const sel = (await page.$(".pipo-card-focused .pay-button")) ? ".pipo-card-focused .pay-button" : ".pay-button";
  try { await page.locator(sel).first().click({ timeout: 15000 }); }
  catch { await page.evaluate((s) => document.querySelector(s)?.click(), sel); }
  alog("Klik bayar (mulai free trial)");
}

// Ambil QR MoMo terus-menerus + kirim ke app (mirror), sampai sukses / ditolak / expired.
// Setelah admin scan: QR hilang → halaman proses. Hasil: fault-container = gagal, about:blank = sukses.
async function watchMomoQr(page, acc, alog, hooks, shouldStop) {
  let lastQr = "", progressed = false, hadQr = false;
  const done = (status, msg) => { hooks.payStatus?.(acc.id, status, msg); return status; };
  const deadline = Date.now() + 12 * 60 * 1000; // QR MoMo ± 10 menit
  while (!shouldStop() && Date.now() < deadline) {
    if (page.isClosed()) break; // popup checkout menutup diri saat selesai
    try {
      const url = page.url();
      if (/momo\.vn|processing|agreement-cashier/i.test(url)) progressed = true;
      if (await page.$(".fault-status-container")) {
        const msg = (await page.textContent(".pipo-status-title").catch(() => "")) || "Ditolak";
        return done("error", msg.trim());
      }
      // sukses: setelah proses bayar, navigasi balik ke about:blank (lalu popup menutup)
      if (progressed && url.startsWith("about:blank")) return done("success", "Pembayaran berhasil");
      const qr = await page.getAttribute(".image-qr-code", "src").catch(() => null);
      const expire = ((await page.textContent(".time-expire-text").catch(() => "")) || "").trim();
      if (qr) {
        hadQr = true;
        if (qr !== lastQr) { lastQr = qr; alog(`QR diperbarui (exp ${expire})`, "step"); }
        hooks.qr?.(acc.id, qr, expire); // kirim QR (+ countdown) ke app
      } else if (hadQr) {
        hadQr = false; // QR hilang dari halaman (di-scan) → sembunyikan kartu, tandai memproses
        alog("QR hilang dari halaman — memproses", "step");
        hooks.payStatus?.(acc.id, "processing", "Memproses pembayaran…");
      }
      await page.waitForTimeout(1000); // cek QR tiap 1 detik
    } catch {
      if (page.isClosed()) break;
      await sleep(800); // navigasi/transisi sesaat → coba lagi
    }
  }
  if (shouldStop()) return "stopped";
  // popup tertutup setelah melewati proses bayar = sukses
  if (page.isClosed() && progressed) return done("success", "Pembayaran berhasil");
  return done("expired", "QR / waktu habis");
}

async function doPaymentSteps(page, acc, alog, hooks, shouldStop) {
  await selectMomo(page, alog);
  await clickPay(page, alog);
  await page.waitForURL(/payment\.momo\.vn/, { timeout: 60000 }).catch(() => {});
  alog("QR MoMo siap — menunggu admin scan", "captcha"); // level captcha → beep + flash taskbar
  hooks.payStatus?.(acc.id, "qr", "Menunggu scan");
  const res = await watchMomoQr(page, acc, alog, hooks, shouldStop);
  if (res === "success") { hooks.paid?.(acc.id); alog(`Pembayaran berhasil (Pro): ${acc.email}`, "success"); return "paid"; }
  if (res === "stopped") return; // dihentikan
  if (res === "error") throw new Error("Pembayaran ditolak");
  throw new Error("QR expired / timeout");
}

// Buka link checkout. Return false kalau gagal/expired (about:blank atau page tertutup).
async function openLink(page, url) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2000);
  } catch { return false; }
  return !page.isClosed() && !page.url().startsWith("about:blank");
}

// Ambil link baru via CLIProxy (wajib) dari sesi cookies.
async function refreshLink(acc, alog, hooks, headless, refetchProxyFn) {
  if (!acc.cookiesJson) throw new Error("Tak ada sesi untuk ambil ulang link");
  const rProxy = await refetchProxyFn?.();
  if (!rProxy) throw new Error("Butuh proxy CLIProxy VN untuk ambil ulang link");
  alog("Ambil link baru via CLIProxy (dari sesi)", "warn");
  const fresh = await refetchLink(acc.cookiesJson, rProxy, alog, headless, "payment");
  if (!fresh) throw new Error("Gagal ambil link baru");
  hooks.linkUpdated?.(acc.id, fresh);
  acc.link = fresh;
  return fresh;
}

async function processPayment(cfg, acc, payProxy, alog, hooks, shouldStop) {
  const headless = cfg.headless !== false;
  try {
    // 2 percobaan: kalau link expired (page nutup / about:blank), refresh link lalu ulang.
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (shouldStop()) return;
      if (!acc.link) await refreshLink(acc, alog, hooks, headless, cfg.acquireCliProxy);
      const { browser, cleanup } = await launchCamoufox({ headless, p: payProxy, group: "payment" });
      try {
        const context = await browser.newContext();
        const page = await context.newPage();
        if (!await openLink(page, acc.link)) {
          if (attempt >= 2) throw new Error("Link tetap expired setelah refresh");
          await refreshLink(acc, alog, hooks, headless, cfg.acquireCliProxy);
          continue;
        }
        return await doPaymentSteps(page, acc, alog, hooks, shouldStop); // "paid"
      } catch (e) {
        if (e instanceof NoFreeTrial || e instanceof AlreadyPro) throw e;
        if (shouldStop()) return; // dihentikan → jangan retry
        const expired = /closed|Target page|expired|Timeout/i.test(e.message || "");
        if (attempt < 2 && expired && acc.cookiesJson) {
          alog(`Gagal (${clean(e.message)}) — kemungkinan link expired, refresh & ulang`, "warn");
          try { await refreshLink(acc, alog, hooks, headless, cfg.acquireCliProxy); }
          catch (e2) { if (e2 instanceof NoFreeTrial || e2 instanceof AlreadyPro) throw e2; }
          continue;
        }
        throw e;
      } finally {
        await browser.close().catch(() => {});
        cleanup();
      }
    }
  } catch (e) {
    if (e instanceof AlreadyPro) {
      alog(`Akun sudah Pro — tandai & skip: ${acc.email}`, "success");
      hooks.paid?.(acc.id);
      hooks.payStatus?.(acc.id, "success", "Sudah Pro");
      return "paid";
    }
    if (e instanceof NoFreeTrial) {
      alog(`Pro tidak gratis lagi (${e.price}) — akun dihapus: ${acc.email}`, "warn");
      hooks.removeAccount?.(acc.id);
      hooks.payStatus?.(acc.id, "error", "Pro tidak gratis — dihapus");
      return "removed";
    }
    throw e;
  }
}

export async function runPayment(cfg, hooks, shouldStop) {
  const accounts = cfg.accounts || [];
  const queue = [...accounts];
  const c = Math.min(accounts.length, Math.max(1, cfg.concurrent || 6)); // maks 6 QR/pembayaran bersamaan
  let ok = 0, done = 0;

  async function worker() {
    while (!shouldStop()) {
      const acc = queue.shift();
      if (!acc) return;
      const alog = (m, l = "info") => hooks.log(m, l, `#${acc.id}`);
      try {
        const proxy = cfg.acquirePayProxy ? await cfg.acquirePayProxy() : null; // proxy sesuai pilihan (bisa null = proxyless)
        alog(`Auto payment: ${acc.email}${proxy ? ` via ${proxy.host}:${proxy.port}` : " (proxyless)"}`);
        const r = await processPayment(cfg, acc, proxy, alog, hooks, shouldStop);
        if (r === "paid") ok++;
      } catch (e) {
        if (!shouldStop()) alog(`Payment failed: ${clean(e.message)}`, "error");
      }
      hooks.progress(++done, accounts.length);
    }
  }

  await Promise.all(Array.from({ length: c }, worker));
  hooks.log(`${shouldStop() ? "Stopped" : "Finished"} — ${ok}/${accounts.length} paid`, ok === accounts.length ? "success" : "warn");
  return { ok, total: accounts.length };
}

// ---------------------------------------------------------------- Canva
// Daftar akun Canva: email Litensi (site canva.com) → verifikasi kode → set password via reset.
class Canva {
  constructor(cfg, otp, log) {
    this.cfg = cfg;
    this.otp = otp;
    this.log = log;
    this.email = null;
    this.orderId = null;
    this.resetOrderId = null;
    this.cookiesJson = null;
  }

  async orderEmail() {
    this.log(`Requesting email from ${this.cfg.provider}`);
    const { id, email } = await this.otp.orderEmail(this.cfg.site, this.cfg.zone || null);
    this.orderId = id;
    this.email = email;
    this.log(`Email ready: ${this.email} (order #${this.orderId})`);
  }

  async _click(page, locator, label, timeout = 20000) {
    const loc = typeof locator === "string" ? page.locator(locator).first() : locator;
    await loc.waitFor({ state: "visible", timeout });
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    await loc.hover().catch(() => {}); // gerakkan kursor ke tombol dulu
    await page.waitForTimeout(rand(160, 480));
    try { await loc.click({ timeout: 5000 }); }
    catch { await loc.click({ force: true, timeout: 5000 }); }
    this.log(label);
  }

  // Ketik seperti manusia: fokus, jeda, per-karakter delay acak + sesekali jeda "mikir".
  async _type(page, locator, text) {
    const loc = typeof locator === "string" ? page.locator(locator).first() : locator;
    await loc.click();
    await page.waitForTimeout(rand(120, 320));
    for (const ch of text) {
      await page.keyboard.type(ch, { delay: rand(55, 170) });
      if (Math.random() < 0.07) await page.waitForTimeout(rand(160, 480));
    }
  }

  async _flow(page, context) {
    // banner cookie tak selalu muncul → best-effort
    try { await page.getByRole("button", { name: "Accept all cookies" }).click({ timeout: 6000 }); this.log("Cookies diterima"); } catch {}

    await this._click(page, page.getByRole("button", { name: "Continue with email" }), "Pilih daftar via email");
    await page.waitForSelector("input[name='username']", { timeout: 20000 });
    await page.fill("input[name='username']", this.email);
    this.log("Email dimasukkan");

    // Layar konfirmasi bisa >1 (klik Continue) sampai muncul input kode.
    for (let i = 0; i < 3; i++) {
      if (await page.$("input[autocomplete='one-time-code']")) break;
      try { await page.getByRole("button", { name: "Continue", exact: true }).first().click({ timeout: 6000 }); this.log("Klik Continue"); } catch {}
      await page.waitForTimeout(1500);
    }

    await page.waitForSelector("input[autocomplete='one-time-code']", { timeout: 30000 });
    this.log("Waiting for verification code");
    const code = await this.otp.waitOtp(this.orderId, 180);
    if (!code) throw new Error("Kode verifikasi tidak diterima");
    const otp = page.locator("input[autocomplete='one-time-code']").first();
    await otp.click();
    await otp.type(code, { delay: 100 });
    this.log(`Kode dimasukkan: ${code}`);
    try { await page.getByRole("button", { name: "Continue", exact: true }).first().click({ timeout: 5000 }); } catch {} // sebagian form auto-submit

    // Sukses: keluar dari /signup (mis. navigasi ke /templates)
    this.log("Menunggu akun terbuka");
    await page.waitForFunction(() => !location.pathname.includes("/signup") && !location.pathname.includes("/verify"),
      null, { timeout: 90000 }).catch(() => {});
    if (page.url().includes("/signup")) throw new Error("Pendaftaran tidak selesai (masih di signup)");
    this.log(`Akun dibuat: ${this.email}`, "success");

    await this._setPassword(page);

    const state = await context.storageState();
    state.origins = (state.origins || []).filter((o) => /canva/i.test(o.origin || ""));
    this.cookiesJson = JSON.stringify(state);
    this.log("Login session saved");
  }

  // Set password lewat halaman reset: email → (reorder utk OTP kedua) → kode → password baru.
  async _setPassword(page) {
    this.log("Menyetel password via reset");
    await page.goto("https://www.canva.com/id_id/login/reset/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("input[name='username']", { timeout: 20000 });
    await page.waitForTimeout(rand(700, 1500)); // "membaca" halaman dulu
    await this._type(page, "input[name='username']", this.email);
    await page.waitForTimeout(rand(300, 800));

    // Reorder email SEBELUM minta kode → order baru siap menangkap kode reset.
    let order2 = this.orderId;
    if (typeof this.otp.reorder === "function") {
      const r = await this.otp.reorder(this.cfg.site, this.email);
      order2 = this.resetOrderId = r.id;
      this.log(`Reorder email untuk kode kedua (order #${order2})`);
    }
    await this._click(page, page.getByRole("button", { name: "Lanjutkan", exact: true }), "Minta kode reset");

    // Password baru dulu
    await page.waitForSelector("input[autocomplete='new-password']", { timeout: 30000 });
    await page.waitForTimeout(rand(600, 1400));
    const pw = page.locator("input[autocomplete='new-password']");
    await this._type(page, pw.nth(0), this.cfg.password);
    await page.waitForTimeout(rand(400, 900)); // pindah ke field konfirmasi
    await this._type(page, pw.nth(1), this.cfg.password);
    this.log("Password baru diisi");
    await page.waitForTimeout(rand(300, 700));
    await this._click(page, page.getByRole("button", { name: "Buat kata sandi" }), "Simpan password");

    // Baru kode reset (OTP kedua)
    await page.waitForSelector("input[autocomplete='one-time-code']", { timeout: 30000 });
    this.log("Waiting for reset code");
    const code2 = await this.otp.waitOtp(order2, 180);
    if (!code2) throw new Error("Kode reset tidak diterima");
    await page.waitForTimeout(rand(800, 1800)); // "melihat" kode di email
    await this._type(page, "input[autocomplete='one-time-code']", code2);
    this.log(`Kode reset dimasukkan: ${code2}`);
    await page.waitForTimeout(rand(300, 700));
    await this._click(page, page.getByRole("button", { name: "Lanjutkan", exact: true }), "Lanjutkan reset");
    await page.waitForTimeout(rand(2500, 4000)); // tunggu navigasi sukses
    this.log(`Password diatur: ${this.cfg.password}`, "success");
  }

  async run() {
    this.log("Starting Canva registration");
    await this.orderEmail();
    const p = this.cfg.proxy;
    if (p) this.log(`Using proxy ${p.host}:${p.port} (${p.scheme})`);
    const { browser, cleanup } = await launchCamoufox({ headless: this.cfg.headless, p, group: this.cfg.group });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto("https://www.canva.com/signup/", { waitUntil: "domcontentloaded" });
      await this._flow(page, context);
    } finally {
      await browser.close();
      cleanup();
      await this.otp.cancel(this.orderId);
      if (this.resetOrderId) await this.otp.cancel(this.resetOrderId);
    }
    return { email: this.email, password: this.cfg.password, cookiesJson: this.cookiesJson };
  }
}

export async function runBatch(cfg, hooks, shouldStop) {
  if (cfg.region === "vn" && cfg.proxies?.length) return runVnUntilExhausted(cfg, hooks, shouldStop);
  const n = Math.max(1, Number(cfg.count) || 1);
  const c = Math.min(Math.max(1, Number(cfg.concurrent) || 1), n);
  let ok = 0, done = 0, next = 0;

  async function worker() {
    while (true) {
      if (shouldStop()) return;
      const i = ++next;
      if (i > n) return;
      const tag = `#${i}`;
      const alog = (msg, level = "info") => hooks.log(msg, level, tag);
      alog(`Task ${i} of ${n} started`);
      try {
        const proxy = cfg.proxies?.length ? cfg.proxies[(i - 1) % cfg.proxies.length] : null;
        const Bot = cfg.kind === "canva" ? Canva : CapCut;
        const bot = new Bot({ ...cfg, proxy }, createOtp(cfg.provider, cfg.creds), alog);
        const res = await bot.run();
        hooks.saved({ ...res, product: cfg.product || "capcut" });
        alog(`Account created: ${res.email}`, "success");
        ok++;
      } catch (e) {
        if (!shouldStop()) alog(`Failed: ${clean(e.message)}`, "error");
      }
      hooks.progress(++done, n);
    }
  }

  await Promise.all(Array.from({ length: c }, worker));
  const stopped = shouldStop();
  hooks.log(`${stopped ? "Stopped" : "Finished"} — ${ok}/${n} success, ${done - ok} failed`, ok === n && !stopped ? "success" : "warn");
  return { ok, total: n };
}
