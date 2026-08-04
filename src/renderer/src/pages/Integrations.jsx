import { useState } from "react";
import { Plug, ShieldCheck, ShieldAlert, Loader2, Star } from "lucide-react";
import { useApp } from "../store.jsx";
import { Button, Input, Field, Panel, Page, PageHeader, ProviderLogo } from "../components/ui.jsx";
import { PROVIDERS } from "../providers.js";

const KIND_LABEL = { otp: "OTP · Nomor & Email", captcha: "Captcha Solver", browser: "Anti-detect Browser" };

function ProviderCard({ p, values, onChange, onCheck, status, recommended }) {
  const hasFields = p.fields.length > 0;
  return (
    <div className={"rounded-[12px] border bg-card p-4 " + (recommended ? "border-primary/40" : "border-border")}>
      <div className="mb-3 flex items-center gap-3">
        <ProviderLogo p={p} className="h-9 w-9 shadow-[var(--shadow-warm)]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-semibold">{p.name}</span>
            {recommended && <span className="flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary"><Star size={9} /> Rekomendasi</span>}
          </div>
          <div className="text-[11px] text-muted-fg">{KIND_LABEL[p.kind]}</div>
        </div>
        {hasFields && (
          <Button size="sm" onClick={onCheck} disabled={status?.state === "checking"}>
            {status?.state === "checking" ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Cek koneksi
          </Button>
        )}
      </div>

      {hasFields ? (
        <div className="grid grid-cols-2 gap-2.5">
          {p.fields.map((f) => (
            <Field key={f.key} label={f.label} className={p.fields.length === 1 ? "col-span-2" : ""}>
              <Input value={values[f.key] || ""} onChange={(e) => onChange({ [f.key]: e.target.value })} placeholder={f.label} />
            </Field>
          ))}
        </div>
      ) : (
        <p className="text-[12px] text-muted-fg">Tanpa API key — publik, langsung bisa dipakai.</p>
      )}

      {status && status.state === "done" && (
        <div className={"mt-2.5 flex items-center gap-1.5 text-[12px] " + (status.ok ? "text-success" : "text-danger")}>
          {status.ok ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />} {status.msg}
        </div>
      )}
    </div>
  );
}

export default function Integrations() {
  const { integrations, setIntegration, checkProvider, captchaBalance, checkAdspower } = useApp();
  const [checks, setChecks] = useState({});

  const setCheck = (id, v) => setChecks((c) => ({ ...c, [id]: v }));
  async function runCheck(id, fn) {
    setCheck(id, { state: "checking" });
    const r = await fn(id);
    setCheck(id, { state: "done", ok: r.ok, msg: r.ok ? r.info || "Terhubung" : r.error });
  }

  const otp = PROVIDERS.filter((p) => p.kind === "otp");
  const captcha = PROVIDERS.filter((p) => p.kind === "captcha");
  const browser = PROVIDERS.filter((p) => p.kind === "browser");

  const grid = (list, fn) => (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {list.map((p) => (
        <ProviderCard key={p.id} p={p} recommended={p.id === "litensi"}
          values={integrations[p.id] || {}} onChange={(patch) => setIntegration(p.id, patch)}
          onCheck={() => runCheck(p.id, fn)} status={checks[p.id]} />
      ))}
    </div>
  );

  return (
    <Page>
      <PageHeader icon={Plug} title="Integrasi" subtitle="Masukkan API key tiap penyedia lalu cek koneksinya." />
      <div className="space-y-5">
        <Panel title="Penyedia OTP / Email">{grid(otp, checkProvider)}</Panel>
        <Panel title="Captcha Solver">{grid(captcha, captchaBalance)}</Panel>
        <Panel title="Browser">{grid(browser, checkAdspower)}</Panel>
      </div>
    </Page>
  );
}
