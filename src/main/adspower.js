const COMMANDS = {
  "check-status": ["GET", "/status"],
  "get-application-list": ["GET", "/api/v2/category/list"],
  "open-browser": ["POST", "/api/v2/browser-profile/start"],
  "close-browser": ["POST", "/api/v2/browser-profile/stop"],
  "close-all-profiles": ["POST", "/api/v2/browser-profile/stop-all"],
  "create-browser": ["POST", "/api/v2/browser-profile/create"],
  "update-browser": ["POST", "/api/v2/browser-profile/update"],
  "delete-browser": ["POST", "/api/v2/browser-profile/delete"],
  "get-browser-list": ["POST", "/api/v2/browser-profile/list"],
  "get-browser-active": ["GET", "/api/v2/browser-profile/active"],
  "get-opened-browser": ["GET", "/api/v1/browser/local-active"],
  "get-group-list": ["GET", "/api/v1/group/list"],
  "create-group": ["POST", "/api/v1/group/create"],
  "move-browser": ["POST", "/api/v1/user/regroup"],
  "get-profile-cookies": ["GET", "/api/v2/browser-profile/cookies"],
  "new-fingerprint": ["POST", "/api/v2/browser-profile/new-fingerprint"],
  "delete-cache-v2": ["POST", "/api/v2/browser-profile/delete-cache"],
  "get-proxy-list": ["POST", "/api/v2/proxy-list/list"],
  "create-proxy": ["POST", "/api/v2/proxy-list/create"],
};

import { chromium } from "playwright-core";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const OS_UA = [
  { os: "Windows", ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36" },
  { os: "macOS", ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36" },
  { os: "Linux", ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36" },
];

export class Adspower {
  constructor({ apiKey = null, endpoint = null, port = 50325, minInterval = 1000, timeout = 30000 } = {}) {
    this.base = (endpoint || `http://local.adspower.net:${port}`).replace(/\/$/, "");
    this.apiKey = apiKey;
    this.minInterval = minInterval;
    this.timeout = timeout;
    this.last = 0;
  }

  async run(command, params = {}, body = null) {
    const [method, path] = COMMANDS[command] || [];
    if (!path) throw new Error(`unknown command: ${command}`);
    const gap = this.minInterval - (Date.now() - this.last);
    if (gap > 0) await sleep(gap);
    this.last = Date.now();

    let url = this.base + path;
    const init = { method, signal: AbortSignal.timeout(this.timeout), headers: {} };
    if (this.apiKey) init.headers.Authorization = `Bearer ${this.apiKey}`;
    if (method === "GET") {
      const qs = new URLSearchParams(params).toString();
      if (qs) url += `?${qs}`;
    } else {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body ?? params);
    }
    const res = await fetch(url, init);
    if (!res.ok) throw new Error(`${command}: HTTP ${res.status}`);
    let d = await res.json();
    if (d.code === undefined && d.data?.code !== undefined) d = d.data;
    if (d.code !== 0) throw new Error(`${command}: ${d.msg || JSON.stringify(d)}`);
    return d.data || {};
  }

  status() { return this.run("check-status"); }
  async groups(filters = {}) { return (await this.run("get-group-list", { page: 1, page_size: 100, ...filters })).list || []; }
  async profiles(filters = {}) {
    const out = [];
    for (let page = 1; ; page++) {
      const d = await this.run("get-browser-list", { page, limit: 200, ...filters });
      out.push(...(d.list || []));
      if (page >= Number(d.total_pages || 1)) return out;
    }
  }
  async start(profile_id, { url = null, headless = false, ...opts } = {}) {
    if (url) opts.launch_args = [url];
    if (headless) opts.headless = "1";
    const d = await this.run("open-browser", { profile_id, ...opts });
    return { ws: d.ws, debugPort: d.debug_port, webdriver: d.webdriver };
  }
  stop(profile_id) { return this.run("close-browser", { profile_id }); }
  stopAll() { return this.run("close-all-profiles"); }

  async createProfile({ name, groupId = "0", proxy = null } = {}) {
    const picked = OS_UA[Math.floor(Math.random() * OS_UA.length)];
    const d = await this.run("create-browser", {
      name: name || `outlook_${Date.now()}`,
      group_id: groupId,
      user_proxy_config: proxy || { proxy_soft: "no_proxy" },
      open_urls: ["https://www.google.com"],
      fingerprint_config: {
        browser_kernel_config: { type: "chrome", version: "136" },
        ua: picked.ua,
        automatic_timezone: "1",
        language: ["en-US", "en"],
      },
    });
    return { profileId: d.profile_id, os: picked.os };
  }

  remove(profileIds) { return this.run("delete-browser", { profile_id: profileIds }); }

  // Start profile + connect Playwright via CDP; return {browser, context, page, close}
  async connectCDP(profile_id) {
    const info = await this.start(profile_id);
    const endpoint = info.ws?.puppeteer || info.ws;
    if (!endpoint) throw new Error("AdsPower tidak mengembalikan CDP endpoint");
    const browser = await chromium.connectOverCDP(endpoint);
    await sleep(1500);
    const ctx = browser.contexts()[0] || (await browser.newContext());
    const pages = ctx.pages();
    const startup = pages.filter((p) => (p.url() || "").includes("start.adspower.net"));
    const usable = pages.filter((p) => !(p.url() || "").includes("start.adspower.net"));
    if (startup.length && usable.length) for (const p of startup) await p.close().catch(() => {});
    const page = usable[0] || startup[0] || (await ctx.newPage());
    return { browser, context: ctx, page };
  }
}

export async function adspowerStatus(creds) {
  const a = new Adspower(creds);
  await a.status();
  const [profiles, groups] = await Promise.all([a.profiles().catch(() => []), a.groups().catch(() => [])]);
  return { ok: true, info: `Aktif · ${profiles.length} profil · ${groups.length} grup`, profiles: profiles.length, groups: groups.length };
}
