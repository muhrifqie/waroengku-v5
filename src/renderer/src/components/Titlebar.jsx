import { useEffect, useState } from "react";
import { Moon, Sun, Minus, Square, X } from "lucide-react";

const tbBtn =
  "no-drag grid h-[30px] w-[38px] place-items-center rounded-lg text-muted-fg transition hover:bg-secondary hover:text-fg";

export default function Titlebar() {
  const [dark, setDark] = useState(() => localStorage.getItem("theme") !== "light");
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <header className="drag flex h-11 items-center justify-end border-b border-border-subtle bg-[var(--titlebar)] pl-3.5 pr-2 select-none">
      <div className="no-drag flex gap-0.5">
        <button className={tbBtn} title="Ganti tema" onClick={() => setDark((v) => !v)}>
          {dark ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <button className={tbBtn} title="Minimize" onClick={() => window.api.minimize()}><Minus size={15} /></button>
        <button className={tbBtn} title="Maximize" onClick={() => window.api.maximize()}><Square size={13} /></button>
        <button className={tbBtn + " hover:!bg-danger hover:!text-white"} title="Close" onClick={() => window.api.close()}>
          <X size={15} />
        </button>
      </div>
    </header>
  );
}
