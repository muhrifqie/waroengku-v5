import { LayoutDashboard, Wand2, Mail, Users, Plug, Network, TerminalSquare, Settings } from "lucide-react";
import logo from "../assets/icon.png";
import { useApp } from "../store.jsx";

const GROUPS = [
  { title: "Umum", items: [{ key: "dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  { title: "Tools", items: [
    { key: "generator", label: "CapCut Tools", icon: Wand2 },
    { key: "outlook", label: "Outlook Creator", icon: Mail },
  ] },
  { title: "Data", items: [
    { key: "accounts", label: "Akun", icon: Users },
    { key: "proxy", label: "Proxy", icon: Network },
  ] },
  { title: "Sistem", items: [
    { key: "integrations", label: "Integrasi", icon: Plug },
    { key: "terminal", label: "Terminal", icon: TerminalSquare, live: true },
    { key: "settings", label: "Pengaturan", icon: Settings },
  ] },
];

export default function Sidebar({ page, setPage }) {
  const { running } = useApp();

  return (
    <aside className="flex w-[214px] shrink-0 flex-col border-r border-border-subtle bg-gradient-to-b from-card/80 to-card/40">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <img src={logo} className="h-9 w-9 rounded-lg shadow-[var(--shadow-warm)]" alt="" />
        <div className="leading-tight">
          <div className="text-[14px] font-semibold">Waroengku V5</div>
          <div className="text-[11px] text-muted-fg">Dev. Muh Rifq</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-2">
        {GROUPS.map((g, gi) => (
          <div key={g.title} className={gi > 0 ? "mt-1 border-t border-border-subtle pt-2" : ""}>
            <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-fg/50">{g.title}</div>
            <div className="space-y-1">
              {g.items.map(({ key, label, icon: Icon, live }) => {
                const active = page === key;
                return (
                  <button
                    key={key}
                    onClick={() => setPage(key)}
                    className={
                      "group flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-[13px] font-medium transition " +
                      (active ? "bg-primary text-primary-fg shadow-[var(--shadow-warm)]" : "text-muted-fg hover:bg-secondary hover:text-fg")
                    }
                  >
                    <span className="relative">
                      <Icon size={17} strokeWidth={active ? 2.4 : 2} />
                      {live && running && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-success ring-2 ring-card" />}
                    </span>
                    <span className="flex-1 text-left">{label}</span>
                    {live && running && !active && <span className="text-[10px] font-semibold text-success">live</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-border-subtle p-3">
        <div className="flex items-center gap-1.5 px-1 text-[11px] text-muted-fg">
          <span className={"h-1.5 w-1.5 rounded-full " + (running ? "animate-pulse bg-success" : "bg-muted-fg/40")} />
          {running ? "Proses berjalan…" : "Idle"}
        </div>
      </div>
    </aside>
  );
}
