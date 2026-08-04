import { useEffect, useState } from "react";
import Titlebar from "./components/Titlebar.jsx";
import Sidebar from "./components/Sidebar.jsx";
import Setup from "./components/Setup.jsx";
import Overview from "./pages/Overview.jsx";
import Generator from "./pages/Generator.jsx";
import Accounts from "./pages/Accounts.jsx";
import Integrations from "./pages/Integrations.jsx";
import Outlook from "./pages/Outlook.jsx";
import Proxy from "./pages/Proxy.jsx";
import Terminal from "./pages/Terminal.jsx";
import Settings from "./pages/Settings.jsx";
import { AppProvider, useApp } from "./store.jsx";

function Shell() {
  const [page, setPage] = useState("dashboard");
  const { termSignal } = useApp();

  useEffect(() => {
    if (termSignal) setPage("terminal");
  }, [termSignal]);

  return (
    <div className="flex min-h-0 flex-1">
      <Sidebar page={page} setPage={setPage} />
      <main className="min-w-0 flex-1 overflow-hidden">
        {page === "dashboard" && <Overview setPage={setPage} />}
        {page === "generator" && <Generator setPage={setPage} />}
        {page === "accounts" && <Accounts />}
        {page === "outlook" && <Outlook setPage={setPage} />}
        {page === "proxy" && <Proxy />}
        {page === "integrations" && <Integrations />}
        {page === "terminal" && <Terminal />}
        {page === "settings" && <Settings />}
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
