import { useEffect, useState } from "react";
import { Network, Loader2, Trash2, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Button, Page, PageHeader } from "../components/ui.jsx";

const SCHEME_COLOR = {
  http: "bg-info/15 text-info", https: "bg-info/15 text-info",
  socks5: "bg-primary/15 text-primary", socks5h: "bg-primary/15 text-primary", socks4: "bg-warning/15 text-warning",
};

export default function Proxy() {
  const [input, setInput] = useState("");
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(new Set());
  const [note, setNote] = useState("");

  const refresh = async () => setRows(await window.api.listProxies());
  useEffect(() => { refresh(); }, []);

  async function detect() {
    const lines = input.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    setBusy(true);
    setNote(`Mendeteksi ${lines.length} proxy…`);
    const { results, saved } = await window.api.detectProxies(lines);
    setRows(saved);
    const ok = results.filter((r) => r.ok).length;
    setNote(`${ok}/${results.length} proxy hidup & tersimpan`);
    setInput("");
    setBusy(false);
  }

  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allChecked = rows.length > 0 && sel.size === rows.length;
  const toggleAll = () => setSel(allChecked ? new Set() : new Set(rows.map((r) => r.id)));
  async function remove() {
    if (!sel.size) return;
    setRows(await window.api.deleteProxies([...sel]));
    setSel(new Set());
  }

  return (
    <Page scroll={false} wide>
      <PageHeader icon={Network} title="Proxy" subtitle="Tempel proxy apa saja — protokol dideteksi otomatis (HTTP/HTTPS/SOCKS)." />

      <div className="mb-4 rounded-[12px] border border-border bg-card p-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={"Tempel proxy di sini (satu per baris), format bebas:\nhost:port\nhost:port:user:pass\nuser:pass@host:port\nsocks5://user:pass@host:port"}
          className="h-28 w-full resize-none rounded-[10px] border border-border bg-bg px-3 py-2 font-mono text-[13px] text-fg outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/20 placeholder:text-muted-fg/50"
        />
        <div className="mt-2.5 flex items-center gap-3">
          <Button variant="primary" onClick={detect} disabled={busy || !input.trim()}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Wifi size={16} />} Deteksi & Simpan
          </Button>
          <Button onClick={refresh} disabled={busy}><RefreshCw size={15} /> Muat ulang</Button>
          {note && <span className="text-[12px] text-muted-fg">{note}</span>}
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <Button variant="danger" size="sm" onClick={remove} disabled={!sel.size}><Trash2 size={15} /> Hapus</Button>
        {sel.size > 0 && <span className="text-[12px] text-muted-fg">{sel.size} dipilih</span>}
        <div className="flex-1" />
        <span className="text-xs text-muted-fg">{rows.length} proxy · {rows.filter((r) => r.ok).length} hidup</span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-[12px] border border-border bg-card">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="sticky top-0 z-10 bg-secondary text-muted-fg">
              <th className="w-10 px-3 py-2.5 text-left"><input type="checkbox" className="accent-[var(--primary)]" checked={allChecked} onChange={toggleAll} /></th>
              {["Status", "Protokol", "Host:Port", "Auth", "Exit IP", "Negara", "ISP", "Latensi"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const active = sel.has(r.id);
              return (
                <tr key={r.id} onClick={() => toggle(r.id)} className={"cursor-pointer border-t border-border-subtle transition hover:bg-secondary " + (active ? "bg-primary/15 " : "")}>
                  <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="accent-[var(--primary)]" checked={active} onChange={() => toggle(r.id)} /></td>
                  <td className="px-3 py-1.5">{r.ok ? <span className="inline-flex items-center gap-1 text-success"><Wifi size={13} /> hidup</span> : <span className="inline-flex items-center gap-1 text-danger"><WifiOff size={13} /> mati</span>}</td>
                  <td className="px-3 py-1.5"><span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase " + (SCHEME_COLOR[r.scheme] || "bg-secondary text-muted-fg")}>{r.scheme || "?"}</span></td>
                  <td className="px-3 py-1.5 font-mono text-[12px]">{r.host}:{r.port}</td>
                  <td className="px-3 py-1.5 text-muted-fg">{r.username ? "🔑" : "—"}</td>
                  <td className="px-3 py-1.5 font-mono text-[12px]">{r.ip || "—"}</td>
                  <td className="px-3 py-1.5">{r.country || "—"}</td>
                  <td className="px-3 py-1.5 text-muted-fg">{r.isp || "—"}</td>
                  <td className="px-3 py-1.5 tabular-nums text-muted-fg">{r.latency != null ? `${r.latency} ms` : "—"}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan="9" className="p-10 text-center text-muted-fg">Belum ada proxy. Tempel di atas lalu deteksi.</td></tr>}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
