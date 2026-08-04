import { useState } from "react";
import { Mail, Play, Square, CheckCircle2, AlertTriangle, ShieldCheck, Loader2, Plug, Info } from "lucide-react";
import { useApp } from "../store.jsx";
import { Button, Input, Field, Panel, Page, PageHeader } from "../components/ui.jsx";

export default function Outlook({ setPage }) {
  const { integrations, running, progress, startOutlook, stopBot, checkAdspower } = useApp();
  const [count, setCount] = useState("1");
  const [useProxy, setUseProxy] = useState(false);
  const [ads, setAds] = useState({ state: "idle" });
  const pct = progress.total ? (progress.done / progress.total) * 100 : 0;

  const adsFilled = !!(integrations.adspower?.apiKey || "").trim();
  const adsOk = ads.state === "ok";
  const ready = adsOk;

  async function checkAds() {
    setAds({ state: "checking" });
    const r = await checkAdspower("adspower");
    setAds(r.ok ? { state: "ok", msg: r.info } : { state: "bad", msg: r.error });
  }

  const reqs = [
    { ok: adsFilled, title: "API Key AdsPower", desc: "Isi di Integrasi → Browser", action: <Button size="sm" onClick={() => setPage("integrations")}><Plug size={14} /> Atur</Button> },
    { ok: adsOk, warn: ads.state === "bad", title: "Koneksi AdsPower", desc: ads.state === "checking" ? "Memeriksa…" : adsOk ? ads.msg : (ads.msg || "Pastikan aplikasi AdsPower berjalan, lalu cek"),
      action: <Button size="sm" onClick={checkAds} disabled={ads.state === "checking"}>{ads.state === "checking" ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Cek</Button> },
  ];
  const errors = reqs.filter((r) => !r.ok);

  return (
    <Page scroll={false}>
      <PageHeader icon={Mail} title="Outlook Creator" subtitle="Buat akun Outlook via profil AdsPower (anti-detect)." />

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-2">
        <div className="flex items-start gap-3 rounded-[12px] border border-info/30 bg-info/10 p-3.5 text-[13px]">
          <Info size={18} className="mt-0.5 shrink-0 text-info" />
          <div className="text-muted-fg">
            Tiap akun dibuat di <b className="text-fg">profil AdsPower baru</b> (fingerprint acak). Browser terbuka —
            kalau muncul <b className="text-fg">captcha "Press and hold"</b>, selesaikan manual (maks 5 menit), sisanya otomatis.
            Akun tersimpan ke folder <b className="text-fg">Outlook</b>.
          </div>
        </div>

        {errors.length > 0 ? (
          <Panel title="Persyaratan">
            <ul className="divide-y divide-border-subtle">
              {errors.map((r, i) => (
                <li key={i} className="flex items-center gap-3 py-3">
                  <AlertTriangle size={18} className="text-warning" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium">{r.title}</div>
                    <div className="text-[12px] text-muted-fg">{r.desc}</div>
                  </div>
                  {r.action}
                </li>
              ))}
            </ul>
          </Panel>
        ) : (
          <div className="flex items-center gap-2 rounded-[14px] border border-success/30 bg-success/10 px-4 py-3 text-[13px] text-success">
            <CheckCircle2 size={18} /> AdsPower terhubung — siap dijalankan.
          </div>
        )}
      </div>

      <div className="-mx-6 mt-3 flex flex-wrap items-end gap-4 border-t border-border bg-bg px-6 pt-3.5">
        <Field label="Jumlah akun" className="w-28"><Input value={count} onChange={(e) => setCount(e.target.value)} /></Field>
        <label className="flex cursor-pointer items-center gap-2 pb-2 text-[13px] font-medium" title="Rotasi proxy hidup ke tiap profil AdsPower">
          <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={useProxy} onChange={(e) => setUseProxy(e.target.checked)} />
          Proxy
        </label>
        <div className="flex flex-1 items-center gap-2 pb-1.5">
          {progress.total > 0 && (
            <>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} /></div>
              <span className="text-[12px] tabular-nums text-muted-fg">{progress.done}/{progress.total}</span>
            </>
          )}
        </div>
        <div className="pb-1.5">
          {!ready && !running && <span className="mr-3 inline-flex items-center gap-1.5 text-[12px] text-warning"><AlertTriangle size={14} /> AdsPower belum siap</span>}
          {running
            ? <Button variant="primary" onClick={stopBot}><Square size={15} /> Stop</Button>
            : <Button variant="primary" onClick={() => startOutlook(count, useProxy)} disabled={!ready}><Play size={15} /> Mulai Buat</Button>}
        </div>
      </div>
    </Page>
  );
}
