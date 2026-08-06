// CLIProxy — penyedia proxy residensial. Alur: start (bind N proxy negara X) → online (daftar).
const BASE = "https://api.cliproxy.com/v1";

async function post(path, params) {
  const r = await fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8", accept: "application/json" },
    body: new URLSearchParams(params).toString(),
  });
  const j = await r.json();
  if (j.code !== 0) throw new Error(j.msg || `CLIProxy error (${j.code})`);
  return j.data || {};
}

export async function cliproxyInfo({ token }) {
  if (!token) throw new Error("Token kosong");
  const d = await post("/ipPassInfo", { lang: "en", token });
  const remaining = (d.total ?? 0) - (d.spend ?? 0);
  return { ok: true, ip: d.ip, total: d.total, spend: d.spend, remaining, info: `Sisa ${remaining}/${d.total} paket · IP ${d.ip}` };
}

function mapProxy(p) {
  const [host, port] = (p.host_port || "").split(":");
  return {
    raw: `socks5://${p.user}:${p.password}@${host}:${port}`, scheme: "socks5",
    host, port: Number(port), username: p.user, password: p.password,
    ip: p.proxy_ip || null, country: p.country || null, city: p.city || null, latency: null,
  };
}

export async function cliproxyOnline({ key, token }, size = 100) {
  const d = await post("/online", { key, size: String(size), page: "1", lang: "en", token });
  return (d.list || []).map(mapProxy);
}

// Cek proxy yang sudah live dulu; hanya bind (beli) kekurangannya biar tak boros kuota.
export async function cliproxyFetch({ key, token }, num = 1, country = "VN") {
  if (!key || !token) throw new Error("Key/Token kosong");
  const c = country.toUpperCase();
  const live = async () => (await cliproxyOnline({ key, token }, 100)).filter((p) => (p.country || "").toUpperCase() === c);
  let list = await live();
  const short = num - list.length;
  if (short > 0) {
    await post("/start", { key, country, num: String(short), state: "", city: "", asn: "", type: "2", format: "json", lang: "en", token });
    await new Promise((r) => setTimeout(r, 2000)); // beri waktu binding proxy
    list = await live();
  }
  return list;
}
