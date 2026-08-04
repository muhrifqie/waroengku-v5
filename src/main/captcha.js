const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(url, body, timeout = 20000) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  return res.json();
}

const PRESETS = {
  twocaptcha: {
    base: "https://api.2captcha.com",
    recaptchaV2: "RecaptchaV2TaskProxyless",
    recaptchaV3: "RecaptchaV3TaskProxyless",
    image: "ImageToTextTask",
  },
  capsolver: {
    base: "https://api.capsolver.com",
    recaptchaV2: "ReCaptchaV2TaskProxyLess",
    recaptchaV3: "ReCaptchaV3TaskProxyLess",
    image: "ImageToTextTask",
  },
};

class Solver {
  constructor(providerId, { apiKey, endpoint }) {
    this.p = PRESETS[providerId] || PRESETS.twocaptcha;
    this.base = endpoint || this.p.base;
    this.key = apiKey;
  }
  async _solve(task, timeout = 120000) {
    const created = await post(`${this.base}/createTask`, { clientKey: this.key, task });
    if (created.errorId) throw new Error(created.errorDescription || "createTask gagal");
    const id = created.taskId;
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      await sleep(4000);
      const r = await post(`${this.base}/getTaskResult`, { clientKey: this.key, taskId: id });
      if (r.errorId) throw new Error(r.errorDescription || "getTaskResult gagal");
      if (r.status === "ready") return r.solution;
    }
    throw new Error("Captcha timeout");
  }
  async balance() {
    const r = await post(`${this.base}/getBalance`, { clientKey: this.key });
    if (r.errorId) return { ok: false, error: r.errorDescription };
    return { ok: true, info: `saldo $${r.balance}` };
  }
  async recaptchaV2(websiteURL, websiteKey) {
    return (await this._solve({ type: this.p.recaptchaV2, websiteURL, websiteKey })).gRecaptchaResponse;
  }
  async recaptchaV3(websiteURL, websiteKey, pageAction = "verify") {
    return (await this._solve({ type: this.p.recaptchaV3, websiteURL, websiteKey, pageAction })).gRecaptchaResponse;
  }
  async image(base64) {
    return (await this._solve({ type: this.p.image, body: base64 })).text;
  }
}

export function createSolver(providerId, creds) {
  return new Solver(providerId, creds);
}
export async function captchaBalance(providerId, creds) {
  try { return await createSolver(providerId, creds).balance(); }
  catch (e) { return { ok: false, error: e.message }; }
}
