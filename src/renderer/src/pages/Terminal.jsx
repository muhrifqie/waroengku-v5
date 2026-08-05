import { useEffect, useMemo, useRef, useState } from "react";
import { TerminalSquare, Eraser, Copy, ArrowDown, Search, Circle } from "lucide-react";
import { useApp } from "../store.jsx";
import { Page, PageHeader, Input } from "../components/ui.jsx";

const LEVELS = [
  { key: "all", label: "Semua" },
  { key: "success", label: "Sukses", dot: "bg-[#5fd68a]" },
  { key: "error", label: "Error", dot: "bg-[#ff6b6b]" },
  { key: "warn", label: "Warn", dot: "bg-[#ffcf5f]" },
  { key: "info", label: "Info", dot: "bg-[#7aa2ff]" },
];

const COLOR = {
  success: "text-[#5fd68a]", error: "text-[#ff6b6b]", warn: "text-[#ffcf5f]", captcha: "text-[#ffcf5f]", info: "text-[#c9c6bb]",
};

export default function Terminal() {
  const { logs, clearLogs, running } = useApp();
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [auto, setAuto] = useState(true);
  const [atBottom, setAtBottom] = useState(true);
  const boxRef = useRef(null);

  const shown = useMemo(() => {
    const ql = q.toLowerCase();
    return logs.filter((l) => {
      if (filter !== "all" && (l.level || "info") !== filter) return false;
      if (ql && !((l.line || "").toLowerCase().includes(ql) || (l.tag || "").toLowerCase().includes(ql))) return false;
      return true;
    });
  }, [logs, filter, q]);

  const counts = useMemo(() => {
    const c = { success: 0, error: 0, warn: 0 };
    for (const l of logs) if (c[l.level] !== undefined) c[l.level]++;
    return c;
  }, [logs]);

  useEffect(() => {
    const el = boxRef.current;
    if (el && auto) el.scrollTop = el.scrollHeight;
  }, [shown, auto]);

  function onScroll() {
    const el = boxRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    setAtBottom(bottom);
    setAuto(bottom);
  }
  function jump() {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setAuto(true);
  }
  function copyAll() {
    navigator.clipboard.writeText(shown.map((l) => `${l.t} ${l.tag || ""} ${l.line}`).join("\n"));
  }

  const stat = (label, val, cls) => (
    <span className="flex items-center gap-1.5 text-[12px] text-muted-fg">
      <span className={"h-2 w-2 rounded-full " + cls} /> {label} <b className="text-fg tabular-nums">{val}</b>
    </span>
  );

  return (
    <Page scroll={false} wide>
      <PageHeader icon={TerminalSquare} title="Terminal" subtitle="Log proses real-time"
        actions={
          <div className="flex items-center gap-4">
            {stat("Sukses", counts.success, "bg-[#5fd68a]")}
            {stat("Error", counts.error, "bg-[#ff6b6b]")}
            {stat("Warn", counts.warn, "bg-[#ffcf5f]")}
          </div>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-border bg-[#0d0d0b] shadow-[var(--shadow-elevated)]">
        {/* window chrome */}
        <div className="flex items-center gap-3 border-b border-white/10 bg-[#17171400] px-4 py-2.5">
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          </div>
          <span className="font-mono text-[12px] text-[#8a8676]">waroengku@v5 — logs</span>
          <span className={"ml-1 flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] " + (running ? "bg-[#5fd68a]/15 text-[#5fd68a]" : "bg-white/5 text-[#8a8676]")}>
            <Circle size={7} className={running ? "animate-pulse fill-current" : "fill-current"} /> {running ? "berjalan" : "idle"}
          </span>
          <div className="flex-1" />
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6a675c]" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="cari log"
              className="h-7 w-48 rounded-md border border-white/10 bg-white/5 pl-7 pr-2 font-mono text-[12px] text-[#d7d3c7] outline-none placeholder:text-[#6a675c] focus:border-[#5fd68a]/40" />
          </div>
          <button onClick={copyAll} title="Salin semua" className="grid h-7 w-7 place-items-center rounded-md text-[#8a8676] hover:bg-white/10 hover:text-white"><Copy size={14} /></button>
          <button onClick={clearLogs} title="Bersihkan" className="grid h-7 w-7 place-items-center rounded-md text-[#8a8676] hover:bg-white/10 hover:text-white"><Eraser size={14} /></button>
        </div>

        {/* filter chips */}
        <div className="flex items-center gap-1.5 border-b border-white/5 px-4 py-2">
          {LEVELS.map((lv) => (
            <button key={lv.key} onClick={() => setFilter(lv.key)}
              className={"flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition " +
                (filter === lv.key ? "bg-white/15 text-white" : "text-[#8a8676] hover:bg-white/5")}>
              {lv.dot && <span className={"h-1.5 w-1.5 rounded-full " + lv.dot} />} {lv.label}
            </button>
          ))}
          <span className="ml-auto font-mono text-[11px] text-[#6a675c]">{shown.length} baris</span>
        </div>

        {/* log body */}
        <div ref={boxRef} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-auto px-4 py-3 font-mono text-[12px] leading-6">
          {shown.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[#6a675c]">Belum ada aktivitas. Jalankan proses dari CapCut Creator.</div>
          ) : (
            shown.map((l, i) => (
              <div key={i} className="flex gap-3 whitespace-pre-wrap hover:bg-white/[0.03]">
                <span className="shrink-0 select-none text-[#57544a]">{l.t}</span>
                {l.tag && <span className="shrink-0 select-none font-semibold text-[#c08a52]">{l.tag}</span>}
                <span className={COLOR[l.level] || COLOR.info}>{l.line}</span>
              </div>
            ))
          )}
          {running && <div className="mt-0.5 h-4 w-2 animate-pulse bg-[#5fd68a]" />}
        </div>
      </div>

      {!atBottom && (
        <button onClick={jump} className="absolute bottom-8 right-10 flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-fg shadow-[var(--shadow-elevated)]">
          <ArrowDown size={14} /> Terbaru
        </button>
      )}
    </Page>
  );
}
