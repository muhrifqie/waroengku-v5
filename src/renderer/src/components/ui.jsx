import { useEffect, useRef, useState } from "react";
import { X, ChevronDown } from "lucide-react";

const cx = (...a) => a.filter(Boolean).join(" ");

export function Combobox({ value, onChange, options = [], placeholder, className }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const shown = (q ? options.filter((o) => o.toLowerCase().includes(q.toLowerCase())) : options).slice(0, 100);
  return (
    <div ref={ref} className={cx("relative", className)}>
      <input
        value={open ? q : value}
        placeholder={placeholder}
        onChange={(e) => { setQ(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => { setQ(""); setOpen(true); }}
        className="h-9 w-full rounded-[10px] border border-border bg-bg pl-3 pr-8 text-[13px] text-fg outline-none transition hover:border-muted-fg/40 focus:border-primary focus:ring-[3px] focus:ring-primary/20 placeholder:text-muted-fg/50"
      />
      <ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-fg" />
      {open && shown.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-[10px] border border-border bg-card p-1 shadow-[var(--shadow-elevated)]">
          {shown.map((o) => (
            <button key={o} type="button" onMouseDown={(e) => { e.preventDefault(); onChange(o); setOpen(false); }}
              className={"block w-full truncate rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-secondary " + (o === value ? "text-primary" : "")}>
              {o}
            </button>
          ))}
          {q && !options.includes(q) && (
            <button type="button" onMouseDown={(e) => { e.preventDefault(); onChange(q); setOpen(false); }}
              className="block w-full truncate rounded-md px-2.5 py-1.5 text-left text-[13px] text-muted-fg hover:bg-secondary">
              Pakai custom: <b className="text-fg">{q}</b>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={onClose}>
      <div className="w-full max-w-md rounded-[16px] border border-border bg-card p-5 shadow-[var(--shadow-elevated)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-serif text-lg font-semibold">{title}</h3>
          <button className="grid h-8 w-8 place-items-center rounded-lg text-muted-fg hover:bg-secondary hover:text-fg" onClick={onClose}><X size={16} /></button>
        </div>
        {children}
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-[10px] font-semibold transition active:translate-y-px disabled:opacity-55 disabled:cursor-not-allowed";
const variants = {
  primary: "bg-primary text-primary-fg hover:bg-primary-hover",
  ghost: "border border-border text-fg hover:bg-secondary",
  danger: "border border-border text-danger hover:bg-danger/10",
};

export function Button({ variant = "ghost", size = "md", className, ...p }) {
  const sizes = { sm: "px-3 py-1.5 text-[13px]", md: "px-4 py-2 text-sm", icon: "h-9 w-9 text-sm" };
  return <button className={cx(base, variants[variant], sizes[size], className)} {...p} />;
}

export function Input({ className, ...p }) {
  return (
    <input
      className={cx(
        "h-9 w-full rounded-[10px] border border-border bg-bg px-3 text-[13px] text-fg shadow-[0_1px_1px_0_#0000000a] outline-none transition-colors",
        "hover:border-muted-fg/40 focus:border-primary focus:ring-[3px] focus:ring-primary/20 placeholder:text-muted-fg/50",
        className
      )}
      {...p}
    />
  );
}

export function Field({ label, children, className }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-[12px] font-medium text-muted-fg">{label}</span>
      {children}
    </label>
  );
}

export function ProviderLogo({ p, className }) {
  if (p.logo) return <img src={p.logo} className={cx("rounded-lg bg-white object-contain p-1", className)} alt="" />;
  const Icon = p.icon;
  return (
    <div className={cx("grid place-items-center rounded-lg bg-primary/10 text-primary", className)}>
      {Icon ? <Icon size={18} /> : null}
    </div>
  );
}

export function Switch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-[13px] font-medium"
    >
      <span
        className={cx(
          "relative h-[18px] w-8 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-secondary border border-border"
        )}
      >
        <span
          className={cx(
            "absolute top-[2px] h-3.5 w-3.5 rounded-full bg-white shadow transition-all",
            checked ? "left-[15px]" : "left-[2px]"
          )}
        />
      </span>
      {label}
    </button>
  );
}

export function Page({ children, scroll = true, wide = false, className }) {
  return (
    <div className="h-full min-h-0">
      <div className={cx("mx-auto w-full px-6 py-5", wide ? "max-w-none" : "max-w-5xl", scroll ? "h-full overflow-y-auto" : "flex h-full flex-col", className)}>
        {children}
      </div>
    </div>
  );
}

export function PageHeader({ icon: Icon, title, subtitle, actions }) {
  return (
    <header className="mb-4 flex items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Icon size={20} strokeWidth={2} />
          </div>
        )}
        <div>
          <h1 className="text-xl font-semibold leading-tight">{title}</h1>
          {subtitle && <p className="text-[13px] text-muted-fg">{subtitle}</p>}
        </div>
      </div>
      {actions}
    </header>
  );
}

export function Panel({ title, right, children, className }) {
  return (
    <section className={cx("min-w-0", className)}>
      {title && (
        <div className="mb-3 flex items-center justify-between gap-2 border-b border-border-subtle pb-2">
          <h3 className="text-[13.5px] font-semibold text-fg">{title}</h3>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}
