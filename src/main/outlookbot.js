import { Adspower } from "./adspower.js";
import { createOutlookAccount } from "./outlook.js";
import { trackBrowser } from "./bot.js";

const clean = (s) => String(s).replace(/\[[0-9;]*m/g, "").split("\n")[0].trim();

export async function runOutlookBatch(cfg, hooks, shouldStop) {
  const ads = new Adspower({ apiKey: cfg.creds?.apiKey, endpoint: cfg.creds?.endpoint });
  const n = Math.max(1, Number(cfg.count) || 1);
  let ok = 0, done = 0;

  for (let i = 1; i <= n; i++) {
    if (shouldStop()) break;
    const tag = `#${i}`;
    const log = (m, l = "info") => hooks.log(m, l, tag);
    let profileId = null;
    try {
      log(`Task ${i} of ${n} started`, "step");
      const px = cfg.proxies?.length ? cfg.proxies[(i - 1) % cfg.proxies.length] : null;
      const adsProxy = px ? {
        proxy_soft: "other",
        proxy_type: px.scheme?.startsWith("socks") ? "socks5" : px.scheme === "https" ? "https" : "http",
        proxy_host: px.host, proxy_port: String(px.port),
        proxy_user: px.username || "", proxy_password: px.password || "",
      } : null;
      if (px) log(`Using proxy ${px.host}:${px.port} (${px.scheme})`);
      const { profileId: pid, os } = await ads.createProfile({ name: `outlook_${Date.now()}`, groupId: cfg.groupId || "0", proxy: adsProxy });
      profileId = pid;
      log(`AdsPower profile created (${os})`);
      const { browser, page } = await ads.connectCDP(pid);
      const untrack = trackBrowser(browser, "create"); // ikut ditutup paksa saat Stop (grup create)
      try {
        const res = await createOutlookAccount(page, { password: cfg.fixedPassword ? cfg.password : null }, log);
        if (res.success) {
          hooks.saved({ product: cfg.folder || "outlook", email: res.email, password: res.password, prices: {}, cookiesJson: null });
          ok++;
          log(`Account created: ${res.email}`, "success");
        } else {
          log(`Failed: ${res.error}`, "error");
        }
      } finally {
        untrack();
        await browser.close().catch(() => {});
        await ads.stop(pid).catch(() => {});
        if (cfg.deleteProfile) await ads.remove([pid]).catch(() => {});
      }
    } catch (e) {
      log(`Failed: ${clean(e.message)}`, "error");
      if (profileId && cfg.deleteProfile) await ads.remove([profileId]).catch(() => {});
    }
    hooks.progress(++done, n);
  }
  return { ok, total: n };
}
