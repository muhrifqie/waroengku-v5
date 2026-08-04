import { useEffect, useState } from "react";
import { LayoutDashboard, Cpu, MemoryStick, Globe, Gauge, Fingerprint, Server, RotateCw, Zap, Video, Mail, ShieldOff, ArrowRight } from "lucide-react";
import { useApp } from "../store.jsx";
import { Button, Page, PageHeader } from "../components/ui.jsx";

function greeting(h) {
  if (h < 11) return "Selamat pagi!";
  if (h < 15) return "Selamat siang!";
  if (h < 19) return "Selamat sore!";
  return "Selamat malam!";
}

function Info({ icon: Icon, label, value, action }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-fg">
        <Icon size={13} /> {label} {action}
      </div>
      <div className="mt-0.5 truncate text-[14px] font-semibold">{value ?? "…"}</div>
    </div>
  );
}

const TOOLS = [
  { id: "capcut", name: "CapCut Creator", desc: "Daftar akun CapCut otomatis + restore sesi", icon: Video, page: "generator" },
  { id: "outlook", name: "Outlook Creator", desc: "Buat akun Outlook via profil AdsPower", icon: Mail, page: "outlook" },
  { id: "hma", name: "HMA Creator", desc: "Segera hadir", icon: ShieldOff, soon: true },
];

export default function Overview({ setPage }) {
  const { sys, reloadIp, setField } = useApp();
  const [now, setNow] = useState(new Date());
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const gb = (n) => (n == null ? "—" : `${n.toFixed(1)} GB`);
  const time = now.toLocaleTimeString("id-ID", { hour12: false });
  const date = now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  async function onReloadIp() { setReloading(true); await reloadIp(); setReloading(false); }
  function useRecommended() { if (sys?.recommended) { setField("concurrent", String(sys.recommended)); setPage("generator"); } }

  const ipReload = (
    <button onClick={onReloadIp} title="Muat ulang IP" className="text-muted-fg hover:text-primary">
      <RotateCw size={12} className={reloading ? "animate-spin" : ""} />
    </button>
  );

  return (
    <Page>
      <PageHeader icon={LayoutDashboard} title="Dashboard" />

      <div className="mb-4 flex items-center justify-between rounded-[16px] border border-border bg-gradient-to-br from-primary/10 to-card px-6 py-5">
        <div>
          <h2 className="font-serif text-2xl font-semibold">{greeting(now.getHours())}</h2>
          <p className="mt-0.5 text-[13px] capitalize text-muted-fg">{date}</p>
        </div>
        <div className="text-right">
          <div className="font-mono text-4xl font-semibold tabular-nums tracking-tight">{time}</div>
          <div className="mt-0.5 text-[12px] text-muted-fg">Waktu lokal</div>
        </div>
      </div>

      <div className="mb-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-muted-fg">Informasi Perangkat</h3>
          <Button size="sm" onClick={useRecommended} disabled={!sys}><Zap size={14} /> Pakai {sys?.recommended || ""} thread</Button>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
          <Info icon={Cpu} label="Prosesor" value={sys ? `${sys.cores} core` : null} />
          <Info icon={MemoryStick} label="Memori" value={sys ? `${gb(sys.memFree)} / ${gb(sys.memTotal)}` : null} />
          <Info icon={Server} label="Sistem" value={sys ? `${sys.platform} · ${sys.arch}` : null} />
          <Info icon={Gauge} label="Rekomendasi thread" value={sys?.recommended} />
          <Info icon={Globe} label="Alamat IP" value={sys?.ip || "—"} action={ipReload} />
          <Info icon={Globe} label="Lokasi" value={sys?.location || "—"} />
          <Info icon={Server} label="ISP" value={sys?.isp || "—"} />
          <Info icon={Fingerprint} label="Machine ID" value={sys?.machineId} />
        </div>
        <div className="mt-3 truncate border-t border-border-subtle pt-3 text-[12px] text-muted-fg">{sys?.cpu}</div>
      </div>

      <div>
        <h3 className="mb-3 text-[13px] font-semibold text-muted-fg">Tools</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => !t.soon && setPage(t.page)}
              disabled={t.soon}
              className={"group flex items-start gap-3 rounded-[14px] border border-border bg-card p-4 text-left transition " +
                (t.soon ? "cursor-not-allowed opacity-60" : "hover:border-primary/40 hover:shadow-[var(--shadow-elevated)]")}
            >
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><t.icon size={20} /></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold">{t.name}</span>
                  {t.soon && <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-fg">Segera</span>}
                </div>
                <p className="mt-0.5 text-[12px] text-muted-fg">{t.desc}</p>
              </div>
              {!t.soon && <ArrowRight size={16} className="mt-1 text-muted-fg transition group-hover:translate-x-0.5 group-hover:text-primary" />}
            </button>
          ))}
        </div>
      </div>
    </Page>
  );
}
