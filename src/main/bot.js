import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createOtp } from "./otp.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getCamoufox = async () => (await import("camoufox-js")).Camoufox;
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
    const sels = [
      ".LvHeaderUpgradeVipNew",
      "[data-id='TitleBarUpgradeVip'] .upgrade-text",
      "[data-id='TitleBarUpgradeVip'] button.credit-section",
      "[data-id='TitleBarUpgradeVip']",
      "text=Upgrade",
    ];
    for (const sel of sels) {
      const el = await page.$(sel);
      if (!el) continue;
      try {
        await page.evaluate((e) => e.click(), el);
        break;
      } catch {}
    }
    await page.waitForSelector(".subscriptionModal-sections", { timeout: 20000 });
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

    await this._dismissModals(page);
    const state = await context.storageState();
    // pangkas: cookies penuh, localStorage cuma origin capcut/bytedance (buang ad/analytics yg bikin bengkak)
    state.origins = (state.origins || []).filter((o) => /capcut|byteoversea|ibyteimg|bytedance|tiktok/i.test(o.origin || ""));
    this.cookiesJson = JSON.stringify(state);
    this.log("Login session saved");
    try {
      this.prices = await this._openPricing(page);
    } catch (e) {
      this.log(`Pricing skipped: ${clean(e.message)}`, "warn");
    }
  }

  async run() {
    this.log("Starting CapCut registration");
    await this.orderEmail();
    const Camoufox = await getCamoufox();
    const p = this.cfg.proxy;
    const proxy = p ? {
      server: `${p.scheme === "https" ? "http" : p.scheme || "http"}://${p.host}:${p.port}`,
      username: p.username || undefined, password: p.password || undefined,
    } : undefined;
    if (proxy) this.log(`Using proxy ${p.host}:${p.port} (${p.scheme})`);
    const browser = await Camoufox({ headless: this.cfg.headless, proxy });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto("https://www.capcut.com/login", { waitUntil: "domcontentloaded" });
      await this._flow(page, context);
    } finally {
      await browser.close();
      await this.otp.cancel(this.orderId);
    }
    return {
      email: this.email,
      password: this.cfg.password,
      prices: this.prices,
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
  return { ok, total: n };
}
