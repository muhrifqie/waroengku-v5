import { useEffect, useRef, useState } from "react";
import { Hexagon, FileCode2, Package, Fingerprint, Boxes, CheckCircle2, AlertTriangle, Loader2, Download, ExternalLink, Sparkles } from "lucide-react";
import logo from "../assets/icon.png";
import { Button } from "./ui.jsx";

const TONE = {
  ok: { chip: "bg-success/12 text-success", badge: "bg-success/15 text-success", label: "siap" },
  missing: { chip: "bg-warning/12 text-warning", badge: "bg-warning/15 text-warning", label: "perlu" },
  optional: { chip: "bg-secondary text-muted-fg", badge: "bg-secondary text-muted-fg", label: "opsional" },
  checking: { chip: "bg-secondary text-muted-fg", badge: "bg-secondary text-muted-fg", label: "cek…" },
};

export default function Setup({ onDone }) {
  const [chk, setChk] = useState(null);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState([]);
  const consoleRef = useRef(null);

  useEffect(() => {
    const off = window.api.onSetupLog((p) => setLogs((l) => [...l, p]));
    check();
    return off;
  }, []);
  useEffect(() => {
    if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [logs]);

  async function check() { setChk(await window.api.checkSetup()); }
  async function install() {
    setBusy(true);
    await window.api.installSetup();
    setBusy(false);
    check();
  }

  const s = chk;
  const items = s ? [
    { icon: Hexagon, name: "Node.js runtime", state: "ok", text: "v" + s.node },
    {
      icon: FileCode2, name: "Python runtime", optional: true,
      state: s.python?.ok ? "ok" : "optional",
      text: s.python?.ok ? `v${s.python.version}${s.python.pip ? " · pip" : ""}` : "belum terpasang (opsional)",
      action: !s.python?.ok && { label: "Unduh", href: "https://www.python.org/downloads/" },
    },
    { icon: Package, name: "Dependencies (camoufox-js, playwright)", state: s.deps ? "ok" : "missing", text: s.deps ? "terpasang" : "belum ada" },
    { icon: Fingerprint, name: "Browser Camoufox (anti-deteksi)", state: s.browser ? "ok" : "missing", text: s.browser ? "siap dipakai" : "belum diunduh (± 150 MB)" },
    ...(s.pydeps?.required?.length ? [{
      icon: Boxes, name: "Python packages", optional: !s.python?.ok,
      state: s.python?.ok ? (s.pydeps.missing.length ? "missing" : "ok") : "optional",
      text: s.pydeps.missing.length ? `${s.pydeps.missing.length} paket belum ada` : `${s.pydeps.required.length} paket lengkap`,
    }] : []),
  ] : [];

  const ready = s && s.deps && s.browser;
  const doneCount = items.filter((i) => i.state === "ok").length;

  return (
    <section className="flex h-full items-center justify-center overflow-y-auto p-8">
      <div className="w-full max-w-[560px] [animation:rise_.5s_var(--ease-smooth)_both]">
        <div className="mb-6 text-center">
          <img className="mx-auto mb-4 h-16 w-16 rounded-2xl shadow-[var(--shadow-warm)]" src={logo} alt="" />
          <h1 className="text-[28px] font-semibold">Selamat datang</h1>
          <p className="mx-auto mt-1 max-w-[400px] text-[13px] text-muted-fg">
            Kita siapkan dulu kebutuhan aplikasi. Cukup sekali di awal.
          </p>
        </div>

        {/* progress summary */}
        <div className="mb-3 flex items-center justify-between px-1 text-[12px] text-muted-fg">
          <span className="flex items-center gap-1.5"><Sparkles size={13} /> Persyaratan</span>
          <span className="tabular-nums">{items.length ? `${doneCount}/${items.length} siap` : "memeriksa…"}</span>
        </div>

        <ul className="overflow-hidden rounded-[14px] border border-border">
          {(items.length ? items : [1, 2, 3]).map((it, i) => {
            if (typeof it === "number") return <li key={i} className="h-[58px] animate-pulse border-b border-border-subtle bg-secondary/40 last:border-0" />;
            const t = TONE[it.state] || TONE.checking;
            const Icon = it.icon;
            const StatusIcon = it.state === "ok" ? CheckCircle2 : it.state === "missing" ? AlertTriangle : null;
            return (
              <li key={i} className="flex items-center gap-3 border-b border-border-subtle bg-card px-4 py-3 last:border-0">
                <div className={"grid h-9 w-9 shrink-0 place-items-center rounded-[10px] " + t.chip}><Icon size={17} /></div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium">{it.name}</div>
                  <div className="truncate text-[12px] text-muted-fg">{it.text}</div>
                </div>
                {it.action && (
                  <button onClick={() => window.api.openExternal(it.action.href)} className="flex items-center gap-1 text-[12px] text-primary hover:underline">
                    {it.action.label} <ExternalLink size={12} />
                  </button>
                )}
                <span className={"flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold " + t.badge}>
                  {StatusIcon && <StatusIcon size={12} />} {t.label}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          {!ready && <Button variant="primary" onClick={install} disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} {busy ? "Menyiapkan…" : "Install & Setup"}</Button>}
          <Button onClick={check} disabled={busy}>Periksa ulang</Button>
          {ready && <Button variant="primary" onClick={onDone}><CheckCircle2 size={16} /> Lanjut ke Aplikasi</Button>}
        </div>

        {logs.length > 0 && (
          <div ref={consoleRef} className="mt-6 h-[180px] overflow-y-auto rounded-[12px] border border-border-subtle bg-[#14140f] px-4 py-3.5 text-left font-mono text-xs leading-7 text-[#d7d3c7]">
            {logs.map((l, i) => <div key={i} className={"l-" + (l.level || "")}>{l.line}</div>)}
          </div>
        )}
      </div>
    </section>
  );
}
