import http from "node:http";

// ESM-only → dynamic import (main dibundel sbg CommonJS)
let _Socks, _Http;
async function loadAgents() {
  if (!_Socks) _Socks = (await import("socks-proxy-agent")).SocksProxyAgent;
  if (!_Http) _Http = (await import("http-proxy-agent")).HttpProxyAgent;
  return { SocksProxyAgent: _Socks, HttpProxyAgent: _Http };
}

export function parseProxy(line) {
  line = (line || "").trim();
  if (!line) return null;
  let scheme = null, rest = line;
  const m = line.match(/^(\w+):\/\/(.+)$/);
  if (m && /^(https?|socks[45]h?)$/i.test(m[1])) { scheme = m[1].toLowerCase(); rest = m[2]; }

  let user = null, pass = null, host, port;
  if (rest.includes("@")) {
    const [cred, hp] = rest.split("@");
    [user, pass] = cred.split(":");
    [host, port] = hp.split(":");
  } else {
    const parts = rest.split(":");
    if (parts.length === 4) [host, port, user, pass] = parts;
    else [host, port] = parts;
  }
  if (!host || !port || isNaN(Number(port))) return null;
  return { scheme, host, port: Number(port), user: user || null, pass: pass || null, raw: line };
}

function url(scheme, p) {
  const auth = p.user ? `${encodeURIComponent(p.user)}:${encodeURIComponent(p.pass || "")}@` : "";
  return `${scheme}://${auth}${p.host}:${p.port}`;
}
async function agentFor(scheme, p) {
  const { SocksProxyAgent, HttpProxyAgent } = await loadAgents();
  if (scheme.startsWith("socks")) return new SocksProxyAgent(url(scheme, p));
  return new HttpProxyAgent(url("http", p)); // http/https proxy → http-proxy-agent
}

async function testVia(scheme, p, timeout = 8000) {
  let agent;
  try { agent = await agentFor(scheme, p); } catch { return { ok: false }; }
  return new Promise((resolve) => {
    const t0 = Date.now();
    const req = http.get("http://ip-api.com/json/?fields=query,country,isp", { agent, timeout }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        try { const j = JSON.parse(d); resolve(j.query ? { ok: true, ip: j.query, country: j.country, isp: j.isp, latency: Date.now() - t0 } : { ok: false }); }
        catch { resolve({ ok: false }); }
      });
    });
    req.on("error", () => resolve({ ok: false }));
    req.on("timeout", () => { req.destroy(); resolve({ ok: false }); });
  });
}

export async function detectProxy(line) {
  const p = parseProxy(line);
  if (!p) return { raw: line, ok: false, error: "Format tidak dikenali" };
  const order = p.scheme ? [p.scheme] : ["socks5", "http"]; // auto-detect: coba SOCKS5 lalu HTTP
  for (const s of order) {
    const r = await testVia(s, p);
    if (r.ok) return { raw: line, ok: true, scheme: s, host: p.host, port: p.port, username: p.user, password: p.pass, ip: r.ip, country: r.country, isp: r.isp, latency: r.latency };
  }
  return { raw: line, ok: false, scheme: p.scheme || null, host: p.host, port: p.port, error: "Tidak merespon / mati" };
}

// Cek hidup/mati sekumpulan objek proxy ({scheme,host,port,username,password}) → { alive, dead }.
export async function checkProxies(list, concurrency = 8) {
  const q = list.map((p, i) => [i, p]);
  const alive = [], dead = [];
  async function worker() {
    while (q.length) {
      const [, p] = q.shift();
      const r = await testVia(p.scheme || "socks5", { host: p.host, port: p.port, user: p.username, pass: p.password });
      (r.ok ? alive : dead).push(p);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { alive, dead };
}

export async function detectMany(lines, concurrency = 8) {
  const q = lines.map((l, i) => [i, l]).filter(([, l]) => (l || "").trim());
  const out = [];
  async function worker() { while (q.length) { const [i, l] = q.shift(); out.push([i, await detectProxy(l)]); } }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return out.sort((a, b) => a[0] - b[0]).map(([, r]) => r);
}
