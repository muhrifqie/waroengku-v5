import { useEffect, useRef, useState } from "react";
import logo from "../assets/icon.png";
import { Button } from "./ui.jsx";

const REQS = [
  { key: "node", name: "Node.js runtime" },
  { key: "deps", name: "Dependencies (camoufox-js, playwright)" },
  { key: "browser", name: "Browser Camoufox (anti-deteksi)" },
];

const badgeCls = {
  checking: "bg-secondary text-muted-fg",
  ok: "bg-success/15 text-success",
  missing: "bg-warning/15 text-warning",
};

export default function Setup({ onDone }) {
  const [status, setStatus] = useState({});
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState([]);
  const consoleRef = useRef(null);

  useEffect(() => {
    window.api.onSetupLog((p) => setLogs((l) => [...l, p]));
    check();
  }, []);
  useEffect(() => {
    if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [logs]);

  async function check() {
    setStatus({});
    const s = await window.api.checkSetup();
    setStatus({
      node: { state: "ok", text: "v" + s.node },
      deps: s.deps ? { state: "ok", text: "terpasang" } : { state: "missing", text: "belum ada" },
      browser: s.browser ? { state: "ok", text: "siap" } : { state: "missing", text: "belum diunduh" },
    });
    setReady(s.deps && s.browser);
  }

  async function install() {
    setBusy(true);
    const res = await window.api.installSetup();
    setBusy(false);
    await check();
    if (res.ok) setReady(true);
  }

  return (
    <section className="flex h-full items-center justify-center overflow-y-auto p-8">
      <div className="w-full max-w-[540px] text-center [animation:rise_.5s_var(--ease-smooth)_both]">
        <img className="mx-auto mb-4 h-[60px] w-[60px] rounded-2xl shadow-[var(--shadow-warm)]" src={logo} alt="" />
        <h1 className="mb-1.5 text-[28px] font-semibold">Selamat datang</h1>
        <p className="mx-auto mb-6 max-w-[400px] text-muted-fg">
          Sebelum mulai, kita siapkan dulu semua kebutuhan aplikasi. Cukup sekali di awal.
        </p>

        <ul className="mb-5 overflow-hidden rounded-[10px] border border-border-subtle text-left">
          {REQS.map((r) => {
            const st = status[r.key] || { state: "checking", text: "memeriksa…" };
            return (
              <li key={r.key} className="flex items-center justify-between border-b border-border-subtle px-4 py-3 last:border-0">
                <span className="font-medium">{r.name}</span>
                <span className={"rounded-full px-2.5 py-0.5 text-xs font-semibold " + badgeCls[st.state]}>
                  {st.text}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap justify-center gap-2.5">
          {!ready && (
            <Button variant="primary" onClick={install} disabled={busy}>
              {busy ? "Menyiapkan…" : "Install & Setup"}
            </Button>
          )}
          <Button onClick={check} disabled={busy}>Periksa ulang</Button>
          {ready && <Button variant="primary" onClick={onDone}>Lanjut ke Aplikasi →</Button>}
        </div>

        {logs.length > 0 && (
          <div
            ref={consoleRef}
            className="mt-6 h-[190px] overflow-y-auto rounded-[10px] border border-border-subtle bg-[#14140f] px-4 py-3.5 text-left font-mono text-xs leading-7 text-[#d7d3c7]"
          >
            {logs.map((l, i) => (
              <div key={i} className={"l-" + (l.level || "")}>{l.line}</div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
