const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const codeOf = (s) => (JSON.stringify(s).match(/\b(\d{6})\b/) || JSON.stringify(s).match(/\b(\d{4,8})\b/) || [])[1] || null;

const _last = new Map();
const _chain = new Map();
function rateLimited(key, minMs, fn) {
  const prev = _chain.get(key) || Promise.resolve();
  const next = prev.then(async () => {
    const wait = minMs - (Date.now() - (_last.get(key) || 0));
    if (wait > 0) await sleep(wait);
    try { return await fn(); } finally { _last.set(key, Date.now()); }
  });
  _chain.set(key, next.catch(() => {}));
  return next;
}

async function jfetch(url, opts = {}, timeout = 15000) {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(timeout) });
  const text = (await res.text()).trim();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 160)}`);
  try { return JSON.parse(text); } catch { return text; }
}

class Litensi {
  constructor({ apiId, apiKey, endpoint }) {
    this.creds = { api_id: apiId, api_key: apiKey };
    this.base = endpoint || "https://litensi.id/api";
    this.key = "litensi:" + apiId;
  }
  _post(path, params = {}) {
    return rateLimited(this.key, 5000, async () => {
      const body = new URLSearchParams({ ...this.creds, ...params });
      const json = await jfetch(`${this.base}/${path}`, { method: "POST", body });
      if (!json.success) throw new Error(`Litensi: ${JSON.stringify(json.data)}`);
      return json.data;
    });
  }
  async balance() {
    const zones = await this._post("mail/prices", { site: "capcut.com" });
    return { ok: true, info: `${zones.length} domain` };
  }
  async domains(site) {
    const zones = await this._post("mail/prices", { site });
    return zones.filter((z) => (z.stock || 0) > 0).sort((a, b) => a.price - b.price);
  }
  async orderEmail(site, zone) {
    if (!zone) zone = (await this.domains(site))[0]?.zone;
    const d = await this._post("mail/order", { zone, site });
    return { id: d.order_id, email: d.email || d.mail || d.address };
  }
  async waitOtp(id, timeout = 180) {
    const deadline = Date.now() + timeout * 1000;
    while (Date.now() < deadline) {
      const d = await this._post("mail/getstatus", { order_id: id });
      if (d.status === "RECEIVED") return codeOf(d);
      if (d.status === "CANCELED") throw new Error(`Order ${id} dibatalkan`);
      await sleep(5000);
    }
    throw new Error(`OTP timeout ${timeout}s`);
  }
  cancel(id) { return this._post("mail/setstatus", { order_id: id, status: "CANCELED" }).catch(() => {}); }
}

class HeroSMS {
  constructor({ apiKey, endpoint }) {
    this.base = endpoint || "https://hero-sms.com/api/v1";
    this.headers = { Authorization: `ApiKey ${apiKey}`, "Content-Type": "application/json" };
  }
  _get(path) { return jfetch(`${this.base}${path}`, { headers: this.headers }); }
  async balance() {
    const r = await this._get(`/activations?action=getBalance`);
    const bal = typeof r === "string" ? r.split(":").pop() : (r.balance ?? r.data?.balance);
    return { ok: true, info: `saldo ${bal}` };
  }
  async domains(site) {
    const r = await this._get(`/emails/domains?site=${encodeURIComponent(site)}`);
    const list = Array.isArray(r) ? r : r.data || r.domains || [];
    return list.map((d) => (typeof d === "string" ? { zone: d, price: 0, stock: 1 } : { zone: d.domain || d.zone, price: d.price || 0, stock: d.stock ?? 1 }));
  }
  async orderEmail(site, domain) {
    const r = await jfetch(`${this.base}/emails`, { method: "POST", headers: this.headers, body: JSON.stringify({ site, domain }) });
    const d = r.data || r;
    return { id: d.id || d.emailId, email: d.email || d.address };
  }
  async waitOtp(id, timeout = 180) {
    const deadline = Date.now() + timeout * 1000;
    while (Date.now() < deadline) {
      const r = await this._get(`/emails/${id}`);
      const d = r.data || r;
      const code = codeOf(d);
      if (code && (d.status === "RECEIVED" || d.message || d.code || d.text)) return code;
      await sleep(5000);
    }
    throw new Error(`OTP timeout ${timeout}s`);
  }
  cancel(id) { return jfetch(`${this.base}/emails/${id}`, { method: "DELETE", headers: this.headers }).catch(() => {}); }
}

class SmsVirtual {
  constructor({ apiKey, endpoint }) {
    this.base = endpoint || "https://api.smsvirtual.co";
    this.headers = { "x-api-key": apiKey, "Content-Type": "application/json" };
  }
  _get(path) { return jfetch(`${this.base}${path}`, { headers: this.headers }); }
  async balance() {
    const r = await this._get(`/v1/profile/`);
    return { ok: !!r.status, info: `saldo ${r.data?.balance}` };
  }
  async domains(site) {
    const r = await this._get(`/v1/email/domains?service=${encodeURIComponent(site)}`).catch(() => null);
    const list = r?.data || [];
    return list.map((d) => ({ zone: d.domain || d, price: d.price || 0, stock: d.stock ?? 1 }));
  }
  async orderEmail(site, domain) {
    const r = await jfetch(`${this.base}/v1/email/order`, { method: "POST", headers: this.headers, body: JSON.stringify({ service: site, domain }) });
    const d = r.data || r;
    return { id: d.id || d.orderId, email: d.email || d.address };
  }
  async waitOtp(id, timeout = 180) {
    const deadline = Date.now() + timeout * 1000;
    while (Date.now() < deadline) {
      const r = await this._get(`/v1/email/${id}`);
      const d = r.data || r;
      const code = codeOf(d);
      if (code) return code;
      await sleep(5000);
    }
    throw new Error(`OTP timeout ${timeout}s`);
  }
  cancel(id) { return jfetch(`${this.base}/v1/email/${id}/cancel`, { method: "POST", headers: this.headers }).catch(() => {}); }
}

class SmsBower {
  constructor({ apiKey, endpoint }) {
    this.key = apiKey;
    this.base = endpoint || "https://smsbower.app/stubs/handler_api.php";
  }
  _get(params) {
    const q = new URLSearchParams({ api_key: this.key, ...params });
    return jfetch(`${this.base}?${q}`);
  }
  async balance() {
    const r = await this._get({ action: "getBalance" });
    return { ok: true, info: String(r).replace("ACCESS_BALANCE:", "saldo ") };
  }
  async domains() { return []; }
  async orderEmail(site, domain) {
    const r = await this._get({ action: "buyMailActivation", service: site, mail_domain: domain || "" });
    const s = String(r);
    if (!s.includes(":")) throw new Error(`SMSBower: ${s}`);
    const [, id, email] = s.split(":");
    return { id, email };
  }
  async waitOtp(id, timeout = 180) {
    const deadline = Date.now() + timeout * 1000;
    while (Date.now() < deadline) {
      const r = String(await this._get({ action: "getMailStatus", id }));
      const code = codeOf(r);
      if (code) return code;
      await sleep(5000);
    }
    throw new Error(`OTP timeout ${timeout}s`);
  }
  cancel(id) { return this._get({ action: "setStatus", id, status: 8 }).catch(() => {}); }
}

class Tmail {
  constructor({ apiKey, endpoint }) {
    this.key = apiKey;
    this.base = (endpoint || "").replace(/\/$/, "");
  }
  async balance() {
    const d = await this.domains();
    return { ok: true, info: `${d.length} domain` };
  }
  async domains() {
    const r = await jfetch(`${this.base}/api/domains/${this.key}`);
    const list = Array.isArray(r) ? r : r.domains || r.data || [];
    return list.map((d) => ({ zone: typeof d === "string" ? d : d.domain || d.name, price: 0, stock: 1 }));
  }
  async orderEmail(_site, zone) {
    let domain = zone;
    if (!domain) domain = (await this.domains())[0]?.zone;
    const local = "u" + Math.random().toString(36).slice(2, 10);
    const email = `${local}@${domain}`;
    const r = await jfetch(`${this.base}/api/email/${encodeURIComponent(email)}/${this.key}`);
    const sanitized = typeof r === "string" ? r : r.email || r.data?.email || email;
    return { id: sanitized, email: sanitized };
  }
  async waitOtp(id, timeout = 180) {
    const deadline = Date.now() + timeout * 1000;
    while (Date.now() < deadline) {
      const r = await jfetch(`${this.base}/api/messages/${encodeURIComponent(id)}/${this.key}`);
      const code = codeOf(r);
      if (code) return code;
      await sleep(5000);
    }
    throw new Error(`OTP timeout ${timeout}s`);
  }
  cancel() {}
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

class GeneratorEmail {
  constructor({ endpoint } = {}) {
    this.base = (endpoint || "https://generator.email").replace(/\/$/, "");
  }
  async _session() {
    const res = await fetch(this.base + "/", {
      headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "en-US,en;q=0.9" },
      signal: AbortSignal.timeout(15000),
    });
    const html = await res.text();
    const m = html.match(/name="api-token"\s+content="([^"]+)"/i);
    if (!m) throw new Error("api-token generator.email tidak ketemu");
    const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
    return { token: m[1], cookie };
  }
  async domains() {
    const { token, cookie } = await this._session();
    const headers = {
      "User-Agent": UA, "X-API-Token": token, "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json", Referer: this.base + "/", Origin: this.base,
    };
    if (cookie) headers.Cookie = cookie;
    const r = await fetch(this.base + "/api/domains.php", { headers, signal: AbortSignal.timeout(15000) });
    const data = await r.json();
    const list = Array.isArray(data) ? data : data.domains || data.data || [];
    return list
      .map((d) => (typeof d === "string" ? d : d.ascii || d.domain || d.display || d.name))
      .filter(Boolean)
      .map((zone) => ({ zone, price: 0, stock: 1 }));
  }
  async balance() {
    const d = await this.domains();
    return { ok: true, info: `${d.length} domain` };
  }
  async orderEmail(_site, zone) {
    let domain = zone;
    if (!domain) domain = (await this.domains())[0]?.zone;
    const local = "u" + Math.random().toString(36).slice(2, 10);
    const email = `${local}@${domain}`;
    return { id: email, email };
  }
  async checkDomain(domain) {
    const { cookie } = await this._session();
    const usr = "u" + Math.random().toString(36).slice(2, 8);
    const headers = {
      "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded",
      Accept: "*/*", Referer: this.base + "/", Origin: this.base,
    };
    if (cookie) headers.Cookie = cookie;
    const r = await fetch(this.base + "/uptime.php", {
      method: "POST", headers,
      body: `dmn=${encodeURIComponent(domain)}&usr=${encodeURIComponent(usr)}`,
      signal: AbortSignal.timeout(15000),
    });
    const d = await r.json();
    return { ok: d.status === "good", info: `status: ${d.status}${d.uptime ? ` · uptime ${d.uptime}` : ""}` };
  }
  async waitOtp(id, timeout = 180) {
    const at = id.indexOf("@");
    const user = id.slice(0, at), domain = id.slice(at + 1);
    const headers = {
      "User-Agent": UA, Accept: "text/html", Referer: this.base + "/",
      Cookie: `inbox_ctx=${encodeURIComponent(domain + "/" + user + "/")}`,
    };
    const deadline = Date.now() + timeout * 1000;
    while (Date.now() < deadline) {
      const r = await fetch(`${this.base}/${domain}/${user}`, { headers, signal: AbortSignal.timeout(15000) });
      const html = await r.text();
      const table = html.slice(Math.max(0, html.indexOf("email-table")));
      // OTP CapCut ada di subjek pesan (subj_div_45g45gg)
      const subjects = [...table.matchAll(/subj_div_45g45gg">([^<]*)</g)].map((m) => m[1]);
      for (const s of subjects) {
        const m = s.match(/\b(\d{6})\b/) || s.match(/\b(\d{4,8})\b/);
        if (m) return m[1];
      }
      await sleep(5000);
    }
    throw new Error(`OTP timeout ${timeout}s`);
  }
  cancel() {}
}

const REGISTRY = { litensi: Litensi, herosms: HeroSMS, smsvirtual: SmsVirtual, smsbower: SmsBower, tmail: Tmail, generator: GeneratorEmail };

export function createOtp(providerId, creds) {
  const C = REGISTRY[providerId] || Litensi;
  return new C(creds);
}
export async function providerBalance(providerId, creds) {
  try { return await createOtp(providerId, creds).balance(); }
  catch (e) { return { ok: false, error: e.message }; }
}
export async function providerDomains(providerId, creds, site) {
  return createOtp(providerId, creds).domains(site);
}
export async function providerCheckDomain(providerId, creds, domain) {
  const p = createOtp(providerId, creds);
  if (typeof p.checkDomain !== "function") return { ok: true, info: "validasi tidak tersedia" };
  return p.checkDomain(domain);
}
