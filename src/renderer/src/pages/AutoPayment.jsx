import { useState, useEffect } from "react";
import { CreditCard, Play, Square, RefreshCw, Link2, AlertTriangle, CheckCircle2, XCircle, QrCode, Loader2, ScanLine, MousePointerClick, ChevronLeft, ChevronRight } from "lucide-react";
import { useApp } from "../store.jsx";
import { Button, Page, PageHeader, Panel } from "../components/ui.jsx";

const STATUS = {
  qr: { icon: ScanLine, cls: "text-primary", ring: "border-primary/40", label: "Menunggu scan" },
  processing: { icon: Loader2, cls: "text-warning", ring: "border-warning/40", label: "Memproses" },
  success: { icon: CheckCircle2, cls: "text-success", ring: "border-success/40", label: "Berhasil" },
  error: { icon: XCircle, cls: "text-danger", ring: "border-danger/40", label: "Gagal" },
  expired: { icon: AlertTriangle, cls: "text-warning", ring: "border-warning/40", label: "Kedaluwarsa" },
};

export default function AutoPayment({ active }) {
  const { rows, refresh, paying, payProgress, running, startPayment, stopBot, payQr, clearPayQr, dismissPayQr } = useApp();
  const [sel, setSel] = useState(new Set());
  const headless = true, proxyMode = "dataimpulse"; // otomatis: headless + proxy DataImpulse

  // reset seleksi tiap kali keluar dari halaman ini
  useEffect(() => { if (!active) setSel(new Set()); }, [active]);

  const list = rows.filter((r) => r.product === "capcut-vn" && (r.pipopay_link || r.has_session));
  const emailOf = (id) => rows.find((r) => r.id === Number(id))?.email || `#${id}`;
  const qrs = Object.entries(payQr);
  const count = (st) => qrs.filter(([, q]) => q.status === st).length;
  // hanya QR aktif (menunggu scan) yang tampil; yg berhasil/gagal otomatis hilang dari panel
  const activeQrs = qrs.filter(([, q]) => q.status === "qr");
  const [qrIdx, setQrIdx] = useState(0);
  const safeIdx = activeQrs.length ? Math.min(qrIdx, activeQrs.length - 1) : 0;
  const [curId, curQ] = activeQrs[safeIdx] || [];
  const results = qrs.filter(([, q]) => q.status !== "qr"); // hasil akhir per akun (memproses/sukses/gagal)

  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allChecked = list.length > 0 && list.every((r) => sel.has(r.id));
  const toggleAll = () => setSel(allChecked ? new Set() : new Set(list.map((r) => r.id)));
  const runPay = (ids) => { if (ids.length) { clearPayQr(); startPayment(ids, headless, proxyMode); } };
  const start = () => runPay([...sel]);
  // Bayar Semua: mulai dari akun terlama (id terkecil) dulu — list default newest-first, jadi urut naik.
  const payAll = () => { const ids = [...list].sort((a, b) => a.id - b.id).map((r) => r.id); setSel(new Set(ids)); runPay(ids); };
  const payPct = payProgress.total ? Math.round((payProgress.done / payProgress.total) * 100) : 0;

  return (
    <Page scroll={false} wide>
      <PageHeader icon={CreditCard} title="Auto Payment"
        subtitle="Buka link Pipopay → pilih MoMo → QR di-mirror ke sini untuk di-scan admin."
        actions={qrs.length > 0 && (
          <div className="flex items-center gap-1.5 text-[12px]">
            <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 font-medium text-primary"><ScanLine size={12} /> {count("qr")}</span>
            <span className="flex items-center gap-1 rounded-full bg-warning/10 px-2 py-1 font-medium text-warning"><Loader2 size={12} /> {count("processing")}</span>
            <span className="flex items-center gap-1 rounded-full bg-success/10 px-2 py-1 font-medium text-success"><CheckCircle2 size={12} /> {count("success")}</span>
            <span className="flex items-center gap-1 rounded-full bg-danger/10 px-2 py-1 font-medium text-danger"><XCircle size={12} /> {count("error") + count("expired")}</span>
          </div>
        )} />

      {/* toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[12px] border border-border bg-card p-2.5">
        {paying ? (
          <Button variant="primary" size="sm" onClick={() => stopBot("payment")}><Square size={15} /> Stop</Button>
        ) : (
          <>
            <Button variant="primary" size="sm" onClick={start} disabled={!sel.size}><Play size={15} /> Bayar{sel.size ? ` (${sel.size})` : ""}</Button>
            <Button size="sm" onClick={payAll} disabled={!list.length}><CreditCard size={15} /> Bayar Semua ({list.length})</Button>
          </>
        )}
        <span className="ml-1 text-[12px] text-muted-fg tabular-nums">{sel.size}/{list.length} dipilih</span>

        {payProgress.total > 0 && (
          <div className="ml-2 flex min-w-[160px] flex-1 items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${payPct}%` }} />
            </div>
            <span className="text-[12px] tabular-nums text-muted-fg">{payProgress.done}/{payProgress.total}</span>
          </div>
        )}
        <div className="flex-1" />
        {running && <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary" title="Auto Create sedang jalan — pembayaran tetap bisa jalan berbarengan"><Loader2 size={12} className="animate-spin" /> Create jalan</span>}
        <Button size="icon" onClick={refresh} title="Refresh"><RefreshCw size={15} /></Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-[1fr_380px]">
        {/* daftar akun */}
        <div className="min-h-0 overflow-auto rounded-[12px] border border-border bg-card">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="sticky top-0 z-10 bg-secondary text-muted-fg">
                <th className="w-10 px-3 py-2.5 text-left"><input type="checkbox" className="accent-[var(--primary)]" checked={allChecked} onChange={toggleAll} /></th>
                {["Email", "Password", "Link", "Sesi"].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const active = sel.has(r.id);
                const q = payQr[r.id];
                return (
                  <tr key={r.id} onClick={() => toggle(r.id)} className={"cursor-pointer border-t border-border-subtle transition hover:bg-secondary " + (active ? "bg-primary/15 " : "")}>
                    <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="accent-[var(--primary)]" checked={active} onChange={() => toggle(r.id)} /></td>
                    <td className="max-w-[190px] truncate px-3 py-1.5" title={r.email}>
                      {q && <span className={"mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle " + (STATUS[q.status]?.cls || "").replace("text-", "bg-")} />}
                      {r.email}
                    </td>
                    <td className="px-3 py-1.5">{r.password}</td>
                    <td className="px-3 py-1.5">{r.pipopay_link ? <span className="inline-flex items-center gap-1 text-primary"><Link2 size={13} /> ada</span> : <span className="text-muted-fg">dari sesi</span>}</td>
                    <td className="px-3 py-1.5 text-center">{r.has_session ? <span className="inline-block h-2 w-2 rounded-full bg-success" /> : <span className="inline-block h-2 w-2 rounded-full bg-muted-fg/30" />}</td>
                  </tr>
                );
              })}
              {list.length === 0 && <tr><td colSpan="5" className="p-10 text-center text-muted-fg">Belum ada akun CapCut VN dengan link/sesi.</td></tr>}
            </tbody>
          </table>
        </div>

        {/* mirror QR — 1 tampil, sisanya navigasi kiri/kanan */}
        <div className="min-h-0 overflow-y-auto">
          <Panel title="QR MoMo — scan untuk bayar" right={activeQrs.length > 1 && <span className="text-[11px] text-muted-fg">{safeIdx + 1} / {activeQrs.length}</span>}>
            {!curQ ? (
              <div className="grid place-items-center rounded-[12px] border border-dashed border-border py-20 text-center text-[12px] text-muted-fg">
                <QrCode size={30} className="mb-2 opacity-40" />
                QR muncul di sini saat proses berjalan.
                <span className="mt-1 opacity-70">Scan pakai app MoMo untuk bayar.</span>
              </div>
            ) : (
              <div className="rounded-[14px] border-2 border-primary/40 bg-card p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="truncate text-[12px] font-semibold" title={emailOf(curId)}>{emailOf(curId)}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-primary"><ScanLine size={13} /> Menunggu scan</span>
                    <button onClick={() => dismissPayQr(curId)} title="Tutup / batalkan QR ini" className="text-muted-fg hover:text-danger"><XCircle size={15} /></button>
                  </div>
                </div>
                {curQ.dataUri ? (
                  <div className="text-center">
                    <div className="relative mx-auto h-56 w-56 overflow-hidden rounded-[10px] bg-white p-2 shadow-sm">
                      <img src={curQ.dataUri} alt="QR MoMo" className="h-full w-full" />
                      <div className="qr-scan pointer-events-none absolute inset-x-2 h-0.5 rounded-full bg-primary/70 shadow-[0_0_8px_var(--primary)]" />
                    </div>
                    <div className="mt-2 flex items-center justify-center gap-1.5 text-[12px] text-muted-fg">
                      <MousePointerClick size={13} /> Scan pakai app MoMo
                      {curQ.expire && <>· <b className="tabular-nums text-fg">{curQ.expire}</b></>}
                    </div>
                  </div>
                ) : (
                  <div className="grid h-56 place-items-center text-muted-fg"><Loader2 size={22} className="animate-spin" /></div>
                )}
                {activeQrs.length > 1 && (
                  <div className="mt-3 flex items-center justify-between">
                    <Button size="sm" onClick={() => setQrIdx((safeIdx - 1 + activeQrs.length) % activeQrs.length)}><ChevronLeft size={15} /> Prev</Button>
                    <div className="flex gap-1">
                      {activeQrs.map(([id], i) => <span key={id} className={"h-1.5 w-1.5 rounded-full " + (i === safeIdx ? "bg-primary" : "bg-border")} />)}
                    </div>
                    <Button size="sm" onClick={() => setQrIdx((safeIdx + 1) % activeQrs.length)}>Next <ChevronRight size={15} /></Button>
                  </div>
                )}
              </div>
            )}
          </Panel>

          {/* notifikasi hasil akhir per akun tujuan */}
          {results.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <div className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-fg">Hasil</div>
              {results.map(([id, q]) => {
                const st = STATUS[q.status] || STATUS.qr;
                const Icon = st.icon;
                return (
                  <div key={id} className={"flex items-center justify-between gap-2 rounded-[10px] border px-3 py-2 text-[12px] " + st.ring}>
                    <span className="truncate font-medium" title={emailOf(id)}>{emailOf(id)}</span>
                    <span className={"flex shrink-0 items-center gap-1 font-semibold " + st.cls}>
                      <Icon size={13} className={q.status === "processing" ? "animate-spin" : ""} /> {q.message || st.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}
