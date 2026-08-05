import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createOtp } from "./otp.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
async function launchCamoufox({ headless, p }) {
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
  const built = await launchOptions({ headless, proxy, geoip: !!proxy });
  const browser = await firefox.launch(built);
  return { browser, cleanup: () => relay?.close() };
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
    const { browser, cleanup } = await launchCamoufox({ headless: this.cfg.headless, p });
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

export async function runBatch(cfg, hooks, shouldStop) {
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
        const bot = new CapCut({ ...cfg, proxy }, createOtp(cfg.provider, cfg.creds), alog);
        const res = await bot.run();
        hooks.saved({ ...res, product: cfg.product || "capcut" });
        alog(`Account created: ${res.email}`, "success");
        ok++;
      } catch (e) {
        alog(`Failed: ${clean(e.message)}`, "error");
      }
      hooks.progress(++done, n);
    }
  }

  await Promise.all(Array.from({ length: c }, worker));
  const stopped = shouldStop();
  hooks.log(`${stopped ? "Stopped" : "Finished"} — ${ok}/${n} success, ${done - ok} failed`, ok === n && !stopped ? "success" : "warn");
  return { ok, total: n };
}
