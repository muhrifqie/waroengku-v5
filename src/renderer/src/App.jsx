import { useEffect, useState } from "react";
import Titlebar from "./components/Titlebar.jsx";
import Sidebar from "./components/Sidebar.jsx";
import Setup from "./components/Setup.jsx";
import Overview from "./pages/Overview.jsx";
import Generator from "./pages/Generator.jsx";
import CheckSubs from "./pages/CheckSubs.jsx";
import Accounts from "./pages/Accounts.jsx";
import Integrations from "./pages/Integrations.jsx";
import Outlook from "./pages/Outlook.jsx";
import Proxy from "./pages/Proxy.jsx";
import Terminal from "./pages/Terminal.jsx";
import Settings from "./pages/Settings.jsx";
import { AppProvider, useApp } from "./store.jsx";

const PAGES = {
  dashboard: (p) => <Overview setPage={p} />,
  "capcut-creator": (p) => <Generator setPage={p} />,
  "capcut-subs": () => <CheckSubs />,
  accounts: () => <Accounts />,
  outlook: (p) => <Outlook setPage={p} />,
  proxy: () => <Proxy />,
  integrations: () => <Integrations />,
  terminal: () => <Terminal />,
  settings: () => <Settings />,
};

function Shell() {
  const [page, setPage] = useState("dashboard");
  const [seen, setSeen] = useState(() => new Set(["dashboard"]));
  const { termSignal } = useApp();

  useEffect(() => {
    if (termSignal) setPage("terminal");
  }, [termSignal]);
  // Simpan halaman yg pernah dibuka tetap ter-mount (keep-alive) → state/progress tak reset saat pindah tab.
  useEffect(() => {
    setSeen((s) => (s.has(page) ? s : new Set(s).add(page)));
  }, [page]);

  return (
    <div className="flex min-h-0 flex-1">
      <Sidebar page={page} setPage={setPage} />
      <main className="min-w-0 flex-1 overflow-hidden">
        {[...seen].map((key) => (
          <div key={key} className="h-full" hidden={page !== key}>
            {PAGES[key](setPage)}
          </div>
        ))}
      </main>
    </div>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  return (
    <div className="flex h-full flex-col">
      <Titlebar />
      {!ready ? (
        <main className="min-h-0 flex-1 overflow-hidden">
          <Setup onDone={() => setReady(true)} />
        </main>
      ) : (
        <AppProvider>
          <Shell />
        </AppProvider>
      )}
    </div>
  );
}
