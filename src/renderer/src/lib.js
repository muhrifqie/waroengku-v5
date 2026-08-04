export function pickPrices(raw) {
  let data = {};
  try {
    data = JSON.parse(raw || "{}");
  } catch {}
  let pro = "—", team = "—";
  for (const [k, v] of Object.entries(data)) {
    const kl = k.toLowerCase();
    if (kl.startsWith("pro")) pro = v;
    else if (kl.startsWith("tim") || kl.includes("team")) team = v;
  }
  return { pro, team };
}

const parse = (c) => Date.parse((c || "").replace(" ", "T") + "Z");
export const olderThanDay = (c) => {
  const t = parse(c);
  return t && Date.now() - t > 86400000;
};
export const isToday = (c) => {
  const t = parse(c);
  if (!t) return false;
  const d = new Date(t), n = new Date();
  return d.toDateString() === n.toDateString();
};

export function exportCSV(rows) {
  const esc = (x) => `"${String(x ?? "").replace(/"/g, '""')}"`;
  const lines = ["email,password,pro,teams,sesi,dibuat"];
  for (const r of rows) {
    const { pro, team } = pickPrices(r.prices);
    lines.push([r.email, r.password, pro, team, r.cookies_json ? "yes" : "no", r.created_at].map(esc).join(","));
  }
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "akun_capcut.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}
