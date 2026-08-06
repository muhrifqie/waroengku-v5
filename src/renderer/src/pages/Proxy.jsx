import { useEffect, useState } from "react";
import { Network, Loader2, Trash2, RefreshCw, Wifi, WifiOff, Download, HelpCircle, Gauge, BrushCleaning, Plug } from "lucide-react";
import { Button, Page, PageHeader, Modal } from "../components/ui.jsx";
import { useApp } from "../store.jsx";
import cliproxyLogo from "../assets/providers/cliproxy.png";

const SCHEME_COLOR = {
  http: "bg-info/15 text-info", https: "bg-info/15 text-info",
  socks5: "bg-primary/15 text-primary", socks5h: "bg-primary/15 text-primary", socks4: "bg-warning/15 text-warning",
};

export default function Proxy() {
  const { integrations, fetchCliproxy, checkCliproxy } = useApp();
  const [input, setInput] = useState("");
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState("");
  const [sel, setSel] = useState(new Set());
  const [note, setNote] = useState("");
  const [num, setNum] = useState("10");
  const [quota, setQuota] = useState(null);
  const [guide, setGuide] = useState(false);

  const cli = integrations.cliproxy || {};
  const cliReady = !!(cli.key && cli.token);
  const refresh = async () => setRows(await window.api.listProxies());
  useEffect(() => { refresh(); }, []);

  async function detect() {
    const lines = input.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    setBusy("detect"); setNote(`Mendeteksi ${lines.length} proxy…`);
    const { results, saved } = await window.api.detectProxies(lines);
    setRows(saved);
    setNote(`${results.filter((r) => r.ok).length}/${results.length} proxy hidup & tersimpan`);
    setInput(""); setBusy("");
  }

  async function pullCli() {
    setBusy("cli"); setNote(`Mengambil ${num} proxy VN dari CLIProxy…`);
    const r = await fetchCliproxy(Math.max(1, Number(num) || 1));
    if (r?.ok) { await refresh(); setNote(`+${r.proxies.length} hidup · ${r.dead || 0} mati (VN dari CLIProxy)`); checkQuota(); }
    else setNote("CLIProxy: " + (r?.error || "gagal"));
    setBusy("");
  }
  async function checkQuota() {
    if (!cliReady) return;
    const r = await checkCliproxy("cliproxy");
    setQuota(r?.ok ? r : null);
  }
  useEffect(() => { checkQuota(); }, [cliReady]);

  async function recheck() {
    if (!rows.length) return;
    setBusy("recheck"); setNote("Cek ulang semua proxy…");
    const { results, saved } = await window.api.detectProxies(rows.map((r) => r.raw));
    setRows(saved);
    setNote(`${results.filter((r) => r.ok).length}/${results.length} hidup`);
    setBusy("");
  }
  async function cleanDead() {
    const dead = rows.filter((r) => !r.ok).map((r) => r.id);
    if (dead.length) { setRows(await window.api.deleteProxies(dead)); setNote(`${dead.length} proxy mati dihapus`); }
  }

  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allChecked = rows.length > 0 && sel.size === rows.length;
  const toggleAll = () => setSel(allChecked ? new Set() : new Set(rows.map((r) => r.id)));
  async function remove() {
    if (!sel.size) return;
    setRows(await window.api.deleteProxies([...sel]));
    setSel(new Set());
  }

  const live = rows.filter((r) => r.ok).length;

  return (
    <Page scroll={false} wide>
      <PageHeader icon={Network} title="Proxy" subtitle="Kelola proxy — deteksi otomatis (HTTP/HTTPS/SOCKS) atau ambil dari CLIProxy." />

      {/* CLIProxy */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[12px] border border-primary/30 bg-primary/5 p-3">
        <img src={cliproxyLogo} alt="" className="h-9 w-9 shrink-0 rounded-[10px]" />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold">CLIProxy · Vietnam</div>
          <div className="text-[11px] text-muted-fg">
            {!cliReady ? "Isi Key & Token di Integrasi dulu" : quota ? `Sisa ${quota.remaining}/${quota.total} paket · IP ${quota.ip}` : "Terhubung"}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setGuide(true)}><HelpCircle size={14} /> Panduan token</Button>
          <Button size="sm" onClick={checkQuota} disabled={!cliReady}><Gauge size={14} /> Cek kuota</Button>
          <input type="number" min="1" max="50" value={num} onChange={(e) => setNum(e.target.value)}
            className="h-9 w-16 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg outline-none focus:border-primary" />
          <Button variant="primary" size="sm" onClick={pullCli} disabled={!cliReady || busy === "cli"}>
            {busy === "cli" ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Ambil VN
          </Button>
        </div>
      </div>

      {/* paste + detect */}
      <div className="mb-4 rounded-[12px] border border-border bg-card p-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={"Tempel proxy (satu per baris):\nhost:port · host:port:user:pass · user:pass@host:port · socks5://user:pass@host:port"}
          className="h-24 w-full resize-none rounded-[10px] border border-border bg-bg px-3 py-2 font-mono text-[13px] text-fg outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/20 placeholder:text-muted-fg/50"
        />
        <div className="mt-2.5 flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={detect} disabled={busy === "detect" || !input.trim()}>
            {busy === "detect" ? <Loader2 size={16} className="animate-spin" /> : <Wifi size={16} />} Deteksi & Simpan
          </Button>
          {note && <span className="text-[12px] text-muted-fg">{note}</span>}
        </div>
      </div>

      {/* toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="danger" size="sm" onClick={remove} disabled={!sel.size}><Trash2 size={15} /> Hapus</Button>
        <Button size="sm" onClick={recheck} disabled={busy === "recheck" || !rows.length}>{busy === "recheck" ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Cek ulang</Button>
        <Button size="sm" onClick={cleanDead} disabled={!rows.some((r) => !r.ok)}><BrushCleaning size={15} /> Bersihkan mati</Button>
        {sel.size > 0 && <span className="text-[12px] text-muted-fg">{sel.size} dipilih</span>}
        <div className="flex-1" />
        <span className="text-xs text-muted-fg">{rows.length} proxy · {live} hidup</span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-[12px] border border-border bg-card">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="sticky top-0 z-10 bg-secondary text-muted-fg">
              <th className="w-10 px-3 py-2.5 text-left"><input type="checkbox" className="accent-[var(--primary)]" checked={allChecked} onChange={toggleAll} /></th>
              {["Status", "Protokol", "Host:Port", "Auth", "Exit IP", "Negara", "ISP/Kota", "Latensi"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide">{h}</th>
              ))}
              <th className="w-10 px-3 py-2.5"></th>
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
                  <td className="max-w-[160px] truncate px-3 py-1.5 text-muted-fg" title={r.isp || ""}>{r.isp || "—"}</td>
                  <td className="px-3 py-1.5 tabular-nums text-muted-fg">{r.latency != null ? `${r.latency} ms` : "—"}</td>
                  <td className="px-3 py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <button className="rounded-md p-1.5 text-muted-fg hover:bg-danger/10 hover:text-danger" title="Hapus" onClick={() => window.api.deleteProxies([r.id]).then(setRows)}><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan="10" className="p-10 text-center text-muted-fg">Belum ada proxy. Ambil dari CLIProxy atau tempel manual di atas.</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal open={guide} onClose={() => setGuide(false)} title="Cara ambil Token & Key CLIProxy"
        footer={<Button onClick={() => setGuide(false)}>Tutup</Button>}>
        <ol className="list-decimal space-y-2 pl-5 text-[13px] leading-relaxed">
          <li>Buka aplikasi / website CLIProxy lalu login.</li>
          <li>Tekan <b>F12</b> untuk buka DevTools, pindah ke tab <b>Network</b>.</li>
          <li>Klik tombol <b>Refresh IP Balance</b> di CLIProxy.</li>
          <li>Di daftar request, klik <b>ipPassInfo</b> → buka tab <b>Payload</b> (Request).</li>
          <li>Salin nilai <b>token</b> dari payload. Untuk <b>key</b>, lihat request <code>start</code>/<code>online</code> (field <code>key</code>) — sama dengan password proxy kamu.</li>
          <li>Tempel keduanya di menu <b>Integrasi → CLIProxy</b>, lalu klik <b>Cek koneksi</b>.</li>
        </ol>
        <div className="mt-3 flex items-center gap-1.5 rounded-[10px] bg-secondary px-3 py-2 text-[12px] text-muted-fg">
          <Plug size={13} /> Contoh payload: <code className="font-mono">token=xxxxxxxx&amp;lang=en</code>
        </div>
      </Modal>
    </Page>
  );
}
