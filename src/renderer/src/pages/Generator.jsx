import { useState, useEffect, useRef } from "react";
import { Wand2, Play, Square, CheckCircle2, AlertTriangle, ShieldCheck, Loader2, Settings as SettingsIcon, Plug, Star, RefreshCw } from "lucide-react";
import { useApp } from "../store.jsx";
import { Button, Input, Field, Panel, Page, PageHeader, ProviderLogo, Combobox } from "../components/ui.jsx";
import { PROVIDERS } from "../providers.js";

const OTP = PROVIDERS.filter((p) => p.kind === "otp");

export default function Generator({ setPage }) {
  const { cfg, setField, integrations, folders, sys, running, progress, startBot, stopBot, browserReady, litensiStatus, validate, loadDomains, domains, checkDomain } = useApp();
  const [zoneHint, setZoneHint] = useState("");
  const [vdom, setVdom] = useState({ state: "idle" });

  const creds = integrations[cfg.otpProvider] || {};
  const provMeta = OTP.find((p) => p.id === cfg.otpProvider);
  const credsFilled = provMeta?.fields.every((f) => (creds[f.key] || "").trim()) ?? false;
  const capcutFilled = !!(cfg.password && cfg.name.trim() && cfg.year && cfg.month && cfg.day);
  const bad = litensiStatus.state === "bad";
  const ready = browserReady && credsFilled && capcutFilled && !bad;
  const pct = progress.total ? (progress.done / progress.total) * 100 : 0;
  const rec = sys?.recommended || 4;
  const c = Math.min(20, Math.max(1, Number(cfg.concurrent) || 1));
  const over = c > rec;
  const goSettings = <Button size="sm" onClick={() => setPage("settings")}><SettingsIcon size={14} /> Profil</Button>;
  const goIntegrasi = <Button size="sm" onClick={() => setPage("integrations")}><Plug size={14} /> Atur</Button>;

  const cekBtn = (
    <Button size="sm" onClick={() => validate()} disabled={!credsFilled || litensiStatus.state === "checking"}>
      {litensiStatus.state === "checking" ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Cek
    </Button>
  );

  const reqs = [
    { ok: browserReady, title: "Browser Camoufox", desc: "Belum terpasang — jalankan setup dulu", action: null },
    { ok: credsFilled, title: `Kredensial ${provMeta?.name || ""}`, desc: "Lengkapi API key provider di Integrasi", action: goIntegrasi },
    { ok: litensiStatus.state === "ok", warn: true, title: "Validasi / Saldo", desc: bad ? litensiStatus.msg : "Disarankan cek saldo/kredensial dulu", action: cekBtn },
    { ok: capcutFilled, title: "Profil CapCut", desc: "Lengkapi password, nama, tanggal lahir", action: goSettings },
  ];
  const errors = reqs.filter((r) => !r.ok);

  async function onLoadDomains() {
    setZoneHint("Memuat domain…");
    const r = await loadDomains();
    setZoneHint(r.ok ? `${r.items.length} domain (${provMeta?.name})` : "Gagal: " + r.error);
  }
  async function onValidateDomain() {
    if (!cfg.zone) return;
    setVdom({ state: "checking" });
    const r = await checkDomain(cfg.zone);
    setVdom({ state: "done", ok: r.ok, msg: r.ok ? r.info : (r.error || r.info) });
  }

  const prevProv = useRef(cfg.otpProvider);
  useEffect(() => {
    if (prevProv.current !== cfg.otpProvider) {
      prevProv.current = cfg.otpProvider;
      onLoadDomains();
    }
  }, [cfg.otpProvider]);

  return (
    <Page scroll={false}>
      <PageHeader icon={Wand2} title="CapCut Tools" subtitle="Daftar akun CapCut otomatis — pilih penyedia OTP lalu jalankan." />

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-2">
        <Panel title="Penyedia OTP">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {OTP.map((p) => {
              const active = cfg.otpProvider === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setField("otpProvider", p.id)}
                  className={"relative flex items-center gap-2.5 rounded-[12px] border p-3 text-left transition " +
                    (active ? "border-primary bg-primary/10 shadow-[var(--shadow-warm)]" : "border-border hover:bg-secondary")}
                >
                  <ProviderLogo p={p} className="h-8 w-8" />
                  <div className="min-w-0 truncate text-[13px] font-semibold">{p.name}</div>
                  {p.id === "litensi" && <Star size={12} className="absolute right-2 top-2 text-primary" />}
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel title="Detail Akun">
          <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2">
            <Field label="Domain email">
              <div className="flex gap-1.5">
                <Combobox className="flex-1" value={cfg.zone} onChange={(v) => { setField("zone", v); setVdom({ state: "idle" }); }}
                  options={domains.map((d) => d.zone)} placeholder="pilih / ketik domain custom" />
                <Button size="icon" className="shrink-0" title="Muat ulang domain" onClick={onLoadDomains}><RefreshCw size={15} /></Button>
                <Button size="icon" className="shrink-0" title="Validasi domain" onClick={onValidateDomain} disabled={vdom.state === "checking" || !cfg.zone}>
                  {vdom.state === "checking" ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                </Button>
              </div>
              <div className="mt-1 flex items-center gap-3 text-[11px]">
                {zoneHint && <span className="text-muted-fg">{zoneHint}</span>}
                {vdom.state === "done" && <span className={vdom.ok ? "text-success" : "text-danger"}>{vdom.ok ? "✓ " : "✕ "}{vdom.msg}</span>}
              </div>
            </Field>
            <Field label="Password akun"><Input value={cfg.password} onChange={(e) => setField("password", e.target.value)} /></Field>
            <Field label="Simpan ke folder" className="col-span-2">
              <select className="h-9 w-full rounded-[10px] border border-border bg-bg px-3 text-[13px] text-fg outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/20"
                value={cfg.folder} onChange={(e) => setField("folder", e.target.value)}>
                {folders.map((f) => <option key={f.key} value={f.key}>{f.name}</option>)}
              </select>
            </Field>
          </div>
        </Panel>

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
            <CheckCircle2 size={18} /> Semua persyaratan terpenuhi — siap dijalankan.
          </div>
        )}

      </div>

      <div className="-mx-6 mt-3 flex flex-wrap items-end gap-4 border-t border-border bg-bg px-6 pt-3.5">
        <Field label="Jumlah akun" className="w-24"><Input value={cfg.count} onChange={(e) => setField("count", e.target.value)} /></Field>

        <div className="min-w-[200px] max-w-xs flex-1">
          <div className="mb-1.5 flex items-center justify-between text-[12px]">
            <span className="font-medium text-muted-fg">Bersamaan</span>
            <span>
              <b className={over ? "text-warning" : ""}>{c}</b>
              <span className="text-muted-fg"> · rekomendasi {rec}</span>
            </span>
          </div>
          <input type="range" min="1" max="20" value={c} onChange={(e) => setField("concurrent", e.target.value)}
            className="h-1.5 w-full cursor-pointer accent-[var(--primary)]" />
        </div>

        <label className="flex cursor-pointer items-center gap-2 pb-2 text-[13px] font-medium">
          <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={cfg.headless} onChange={(e) => setField("headless", e.target.checked)} />
          Headless
        </label>
        <label className="flex cursor-pointer items-center gap-2 pb-2 text-[13px] font-medium" title="Rotasi proxy hidup dari halaman Proxy">
          <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={cfg.useProxy} onChange={(e) => setField("useProxy", e.target.checked)} />
          Proxy
        </label>

        <div className="flex flex-1 items-center gap-2 pb-1.5">
          {progress.total > 0 && (
            <>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-[12px] tabular-nums text-muted-fg">{progress.done}/{progress.total}</span>
            </>
          )}
        </div>

        <div className="pb-1.5">
          {!ready && !running && <span className="mr-3 inline-flex items-center gap-1.5 text-[12px] text-warning"><AlertTriangle size={14} /> Lengkapi persyaratan</span>}
          {running
            ? <Button variant="primary" onClick={stopBot}><Square size={15} /> Stop</Button>
            : <Button variant="primary" onClick={startBot} disabled={!ready}><Play size={15} /> Mulai Daftar</Button>}
        </div>
      </div>
    </Page>
  );
}
