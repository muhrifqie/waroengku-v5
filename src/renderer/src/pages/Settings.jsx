import { useEffect, useState } from "react";
import { Settings as SettingsIcon, Sun, Moon, Database, Upload, Info, Loader2, RefreshCw, DownloadCloud } from "lucide-react";
import { useApp } from "../store.jsx";
import { Button, Input, Field, Panel, Page, PageHeader } from "../components/ui.jsx";

export default function Settings() {
  const { rows, importLegacy, compactDb, cfg, setField } = useApp();
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const [compacting, setCompacting] = useState(false);
  const [compactMsg, setCompactMsg] = useState("");
  const [ver, setVer] = useState("");
  const [upd, setUpd] = useState({ state: "idle" });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    window.api.getVersion().then(setVer);
    window.api.onUpdateStatus(setUpd);
  }, []);

  async function onCheckUpdate() {
    setUpd({ state: "checking" });
    const r = await window.api.checkUpdate();
    if (!r.ok) setUpd({ state: "error", error: r.error });
  }
  async function onCompact() {
    setCompacting(true);
    setCompactMsg("Mengompres…");
    const r = await compactDb();
    const mb = (n) => (n / 1048576).toFixed(1);
    setCompactMsg(`${mb(r.before)} MB → ${mb(r.after)} MB (${r.trimmed} sesi dipangkas)`);
    setCompacting(false);
  }

  const seg = (on) => "flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-[13px] transition " + (on ? "bg-primary text-primary-fg" : "text-muted-fg hover:text-fg");

  return (
    <Page>
      <PageHeader icon={SettingsIcon} title="Pengaturan" subtitle="Profil akun, tampilan, data, dan aplikasi." />

      <div className="space-y-5">
        <Panel title="Profil CapCut">
          <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4">
            <Field label="Password" className="col-span-2"><Input value={cfg.password} onChange={(e) => setField("password", e.target.value)} /></Field>
            <Field label="Nama" className="col-span-2"><Input value={cfg.name} onChange={(e) => setField("name", e.target.value)} /></Field>
            <Field label="Tanggal lahir" className="col-span-2">
              <div className="flex gap-1.5">
                <Input className="text-center" value={cfg.day} onChange={(e) => setField("day", e.target.value)} placeholder="DD" />
                <Input className="text-center" value={cfg.month} onChange={(e) => setField("month", e.target.value)} placeholder="MM" />
                <Input className="text-center" value={cfg.year} onChange={(e) => setField("year", e.target.value)} placeholder="YYYY" />
              </div>
            </Field>
          </div>
          <p className="mt-2 text-[11px] text-muted-fg">Semua konfigurasi tersimpan otomatis.</p>
        </Panel>

        <Panel title="Tampilan">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13px] font-medium">Tema</div>
              <div className="text-[12px] text-muted-fg">Pilih mode terang atau gelap</div>
            </div>
            <div className="flex gap-1 rounded-[10px] border border-border p-1">
              <button className={seg(!dark)} onClick={() => setDark(false)}><Sun size={15} /> Terang</button>
              <button className={seg(dark)} onClick={() => setDark(true)}><Moon size={15} /> Gelap</button>
            </div>
          </div>
        </Panel>

        <Panel title="Data">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-info/10 text-info"><Database size={18} /></div>
              <div>
                <div className="text-[13px] font-medium">Database</div>
                <div className="text-[12px] text-muted-fg">{rows.length} akun · SQLite (folder userData)</div>
              </div>
            </div>
            <Button onClick={importLegacy}><Upload size={16} /> Impor DB lama</Button>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-3">
            <div className="text-[12px] text-muted-fg">
              Kompres database — pangkas cookies lama & VACUUM.{compactMsg && <span className="ml-1 text-fg">{compactMsg}</span>}
            </div>
            <Button onClick={onCompact} disabled={compacting}>
              {compacting ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />} Compact DB
            </Button>
          </div>
        </Panel>

        <Panel title="Aplikasi">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><DownloadCloud size={18} /></div>
              <div className="min-w-0">
                <div className="text-[13px] font-medium">Waroengku V5 · v{ver}</div>
                <div className="truncate text-[12px] text-muted-fg">
                  {{
                    idle: "Cek pembaruan dari GitHub",
                    checking: "Memeriksa pembaruan…",
                    none: "Sudah versi terbaru",
                    available: `Update tersedia: v${upd.version}`,
                    downloading: `Mengunduh… ${upd.percent || 0}%`,
                    downloaded: `v${upd.version} siap dipasang`,
                    error: upd.error,
                  }[upd.state] || "—"}
                </div>
                {upd.state === "downloading" && (
                  <div className="mt-1 h-1 w-40 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary transition-[width]" style={{ width: `${upd.percent || 0}%` }} /></div>
                )}
              </div>
            </div>
            {upd.state === "available"
              ? <Button variant="primary" onClick={() => window.api.downloadUpdate()}><DownloadCloud size={16} /> Unduh</Button>
              : upd.state === "downloaded"
              ? <Button variant="primary" onClick={() => window.api.installUpdate()}><RefreshCw size={16} /> Restart & Pasang</Button>
              : <Button onClick={onCheckUpdate} disabled={upd.state === "checking" || upd.state === "downloading"}>{upd.state === "checking" ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Cek Update</Button>}
          </div>
        </Panel>

        <Panel title="Tentang">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Info size={18} /></div>
            <p className="text-[13px] text-muted-fg">
              <span className="font-medium text-fg">Waroengku V5</span> · Dev. Muh Rifq. Otomasi anti-deteksi dengan Camoufox.
              Dibangun dengan Electron + Vite + React + Tailwind.
            </p>
          </div>
        </Panel>
      </div>
    </Page>
  );
}
