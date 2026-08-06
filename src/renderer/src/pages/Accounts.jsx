import { useState } from "react";
import { FolderOpen, RotateCcw, Trash2, Copy, Mail, ClipboardList, FileDown, Upload, RefreshCw, Search, Plus, Pencil, ChevronRight, ArrowLeft, Link2, Loader2 } from "lucide-react";
import { useApp } from "../store.jsx";
import { Button, Input, Field, Page, PageHeader, Modal } from "../components/ui.jsx";
import { pickPrices, olderThanDay, exportCSV, fmtWIB } from "../lib.js";
import { FolderIcon, ICON_KEYS, ALL_FOLDER } from "../folders.jsx";

export default function Accounts() {
  const { rows, folders, refresh, restore, refetchLink, del, importLegacy, createFolder, updateFolder, deleteFolder } = useApp();
  const [path, setPath] = useState(null); // null = root explorer, else folder key ("all" = semua)
  const [sel, setSel] = useState(new Set());
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);

  const fname = (key) => folders.find((f) => f.key === key)?.name || key;
  const count = (key) => (key === "all" ? rows.length : rows.filter((r) => r.product === key).length);

  function open(key) { setPath(key); setSel(new Set()); setSearch(""); }
  function goRoot() { setPath(null); setSel(new Set()); setSearch(""); }

  const inFolder = path === "all" ? rows : rows.filter((r) => r.product === path);
  const filtered = inFolder.filter((r) => r.email?.toLowerCase().includes(search.toLowerCase()));
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allChecked = filtered.length > 0 && filtered.every((r) => sel.has(r.id));
  const toggleAll = () => setSel(allChecked ? new Set() : new Set(filtered.map((r) => r.id)));

  const selWithSession = [...sel].filter((id) => rows.find((r) => r.id === id)?.has_session);
  const [copied, setCopied] = useState("");
  function copy(text, label) {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 1500);
  }
  const selRows = () => rows.filter((r) => sel.has(r.id));
  function copyEmails() { copy(selRows().map((r) => r.email).join("\n"), `${sel.size} email disalin`); }
  // combo: email[tab]password[tab]link — link = pipopay (VN), kosong kalau tak ada
  function copyCombo() {
    const lines = selRows().map((r) => `${r.email}\t${r.password}\t${r.pipopay_link || ""}`);
    copy(lines.join("\n"), `${lines.length} baris combo disalin`);
  }
  const hasLink = filtered.some((r) => r.pipopay_link);

  const [busy, setBusy] = useState(new Set());
  async function refetch(id) {
    setBusy((s) => new Set(s).add(id));
    const r = await refetchLink(id);
    setBusy((s) => { const n = new Set(s); n.delete(id); return n; });
    setCopied(r?.ok ? "Link diperbarui" : (r?.error || "Gagal ambil link"));
    setTimeout(() => setCopied(""), 2500);
  }
  async function remove() {
    if (!sel.size) return;
    await del([...sel]);
    setSel(new Set());
  }

  return (
    <Page scroll={false} wide>
      <PageHeader icon={FolderOpen} title="Akun" subtitle={`${rows.length} akun · ${folders.length} folder`} />

      {/* breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-[13px]">
        <button onClick={goRoot} className={path === null ? "font-semibold" : "text-primary hover:underline"}>Akun</button>
        {path !== null && <><ChevronRight size={14} className="text-muted-fg" /><span className="font-semibold">{path === "all" ? "Semua Akun" : fname(path)}</span></>}
        <div className="flex-1" />
        {path === null ? (
          <>
            <Button size="sm" onClick={importLegacy}><Upload size={15} /> Impor DB lama</Button>
            <Button variant="primary" size="sm" onClick={() => setModal({ mode: "create", name: "", icon: "folder" })}><Plus size={15} /> Folder</Button>
          </>
        ) : (
          <Button size="sm" onClick={goRoot}><ArrowLeft size={15} /> Kembali</Button>
        )}
      </div>

      {path === null ? (
        /* ===== root explorer: folder grid ===== */
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            <FolderTile f={ALL_FOLDER} count={count("all")} onOpen={() => open("all")} />
            {folders.map((f) => (
              <FolderTile key={f.key} f={f} count={count(f.key)} onOpen={() => open(f.key)} onEdit={() => setModal({ mode: "edit", key: f.key, name: f.name, icon: f.icon })} />
            ))}
            <button onClick={() => setModal({ mode: "create", name: "", icon: "folder" })}
              className="group flex flex-col items-center gap-2.5 rounded-[14px] p-3 text-muted-fg transition hover:bg-secondary hover:text-primary">
              <div className="relative h-[64px] w-[84px] transition-transform duration-200 group-hover:-translate-y-0.5">
                <div className="absolute left-1.5 top-0 h-3.5 w-9 rounded-t-[7px] border-2 border-b-0 border-dashed border-current opacity-60" />
                <div className="absolute inset-x-0 bottom-0 top-2.5 grid place-items-center rounded-[11px] rounded-tl-none border-2 border-dashed border-current opacity-70">
                  <Plus size={24} />
                </div>
              </div>
              <span className="text-[12px] font-medium">Folder baru</span>
            </button>
          </div>
        </div>
      ) : (
        /* ===== folder contents: table ===== */
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button variant="primary" size="icon" onClick={() => restore(selWithSession)} disabled={!selWithSession.length} title={selWithSession.length ? `Restore sesi (${selWithSession.length})` : sel.size ? "Akun terpilih tidak punya sesi" : "Restore sesi"}><RotateCcw size={15} /></Button>
            <Button variant="danger" size="icon" onClick={remove} disabled={!sel.size} title="Hapus"><Trash2 size={15} /></Button>
            <Button size="icon" onClick={copyEmails} disabled={!sel.size} title="Salin email"><Mail size={15} /></Button>
            <Button size="icon" onClick={copyCombo} disabled={!sel.size} title="Salin combo (email⇥password⇥link)"><ClipboardList size={15} /></Button>
            <Button size="icon" onClick={() => exportCSV(filtered)} disabled={!filtered.length} title="Ekspor CSV"><FileDown size={15} /></Button>
            <Button size="icon" onClick={refresh} title="Refresh"><RefreshCw size={15} /></Button>
            {copied ? <span className="text-[12px] font-medium text-success">{copied}</span> : sel.size > 0 && <span className="text-[12px] text-muted-fg">{sel.size} dipilih</span>}
            <div className="relative ml-auto min-w-0">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg" />
              <Input className="!h-9 w-56 max-w-full !pl-9" placeholder="cari email" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <span className="whitespace-nowrap text-xs text-muted-fg">{filtered.length} akun</span>
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-[12px] border border-border bg-card">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="sticky top-0 z-10 bg-secondary text-muted-fg">
                  <th className="w-10 px-3 py-2.5 text-left"><input type="checkbox" className="accent-[var(--primary)]" checked={allChecked} onChange={toggleAll} /></th>
                  {[...(path === "all" ? ["Folder"] : []), "Email", "Password", ...(hasLink ? ["Pipopay"] : []), "Pro", "Teams", "Sesi", "Dibuat"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide">{h}</th>
                  ))}
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const { pro, team } = pickPrices(r.prices);
                  const active = sel.has(r.id);
                  return (
                    <tr key={r.id} onClick={() => toggle(r.id)}
                        className={"cursor-pointer border-t border-border-subtle transition hover:bg-secondary " + (active ? "bg-primary/15 " : "") + (olderThanDay(r.created_at) ? "text-warning" : "")}>
                      <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="accent-[var(--primary)]" checked={active} onChange={() => toggle(r.id)} /></td>
                      {path === "all" && <td className="px-3 py-1.5"><span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium">{fname(r.product)}</span></td>}
                      <td className="max-w-[190px] truncate px-3 py-1.5" title={r.email}>
                        {r.paid ? <span className="mr-1.5 rounded bg-success/15 px-1.5 py-0.5 text-[10px] font-bold text-success">PRO</span> : null}
                        {r.email}
                      </td>
                      <td className="px-3 py-1.5">{r.password}</td>
                      {hasLink && (
                        <td className="px-3 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                          {r.pipopay_link
                            ? <button onClick={() => copy(r.pipopay_link, "Link disalin")} title="Salin link Pipopay"
                                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20"><Copy size={11} /> Salin</button>
                            : <span className="text-muted-fg">—</span>}
                        </td>
                      )}
                      <td className="px-3 py-1.5 text-right tabular-nums">{pro}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{team}</td>
                      <td className="px-3 py-1.5 text-center">{r.has_session ? <span className="inline-block h-2 w-2 rounded-full bg-success" /> : <span className="inline-block h-2 w-2 rounded-full bg-muted-fg/30" />}</td>
                      <td className="px-3 py-1.5 text-muted-fg" title={r.created_at + " UTC"}>{fmtWIB(r.created_at)}</td>
                      <td className="px-3 py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {r.product === "capcut-vn" && r.has_session && (
                            <button className="rounded-md p-1.5 text-primary hover:bg-primary/10 disabled:opacity-40" disabled={busy.has(r.id)} title="Ambil ulang link Pipopay (login via proxy)" onClick={() => refetch(r.id)}>
                              {busy.has(r.id) ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
                            </button>
                          )}
                          <button className="rounded-md p-1.5 text-primary hover:bg-primary/10 disabled:opacity-40" disabled={!r.has_session} title="Restore sesi" onClick={() => restore([r.id])}><RotateCcw size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan="9" className="p-10 text-center text-muted-fg">Folder ini masih kosong.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <FolderModal state={modal} setState={setModal} folders={folders} onCreate={createFolder} onUpdate={updateFolder} onDelete={deleteFolder} onDeleted={(key) => path === key && goRoot()} count={count} />
    </Page>
  );
}

function FolderTile({ f, count, onOpen, onEdit }) {
  return (
    <button onClick={onOpen} onDoubleClick={onOpen}
      className="group relative flex flex-col items-center gap-2.5 rounded-[14px] p-3 transition hover:bg-secondary">
      <div className="relative transition-transform duration-200 group-hover:-translate-y-0.5">
        {/* folder graphic */}
        <div className="relative h-[64px] w-[84px]">
          <div className="absolute left-1.5 top-0 h-3.5 w-9 rounded-t-[7px] bg-gradient-to-b from-[#e6a585] to-[#dd8f6d]" />
          <div className="absolute inset-x-0 bottom-0 top-2.5 grid place-items-center rounded-[11px] rounded-tl-none bg-gradient-to-b from-[#e2a184] to-[#d97757] shadow-[0_4px_12px_-3px_#d9775766]">
            <FolderIcon name={f.icon} size={26} className="text-white/95" strokeWidth={2.2} />
          </div>
        </div>
        <span className="absolute -right-1.5 -top-1.5 min-w-[20px] rounded-full bg-fg px-1.5 text-center text-[11px] font-semibold text-bg shadow">{count}</span>
      </div>
      <span className="w-full truncate text-center text-[13px] font-medium">{f.name}</span>
      {onEdit && (
        <span onClick={(e) => { e.stopPropagation(); onEdit(); }} title="Edit folder"
          className="absolute right-2 top-2 hidden rounded-md p-1 text-muted-fg hover:bg-border hover:text-fg group-hover:block"><Pencil size={13} /></span>
      )}
    </button>
  );
}

function FolderModal({ state, setState, folders, onCreate, onUpdate, onDelete, onDeleted, count }) {
  const [confirm, setConfirm] = useState(false);
  const [reassign, setReassign] = useState("");
  if (!state) return null;
  const isEdit = state.mode === "edit";
  const close = () => { setState(null); setConfirm(false); setReassign(""); };
  const others = folders.filter((f) => f.key !== state.key);

  async function save() {
    if (!state.name?.trim()) return;
    if (isEdit) await onUpdate(state.key, state.name.trim(), state.icon);
    else await onCreate(state.name.trim(), state.icon);
    close();
  }
  async function doDelete() {
    await onDelete(state.key, reassign || others[0]?.key || "uncategorized");
    onDeleted?.(state.key);
    close();
  }

  return (
    <Modal open onClose={close} title={isEdit ? "Edit Folder" : "Folder Baru"}
      footer={
        <>
          {isEdit && !confirm && <Button variant="danger" className="mr-auto" onClick={() => setConfirm(true)} disabled={count(state.key) > 0 && others.length === 0}><Trash2 size={15} /> Hapus</Button>}
          <Button onClick={close}>Batal</Button>
          {!confirm && <Button variant="primary" onClick={save}>Simpan</Button>}
          {confirm && <Button variant="danger" onClick={doDelete}>Ya, hapus</Button>}
        </>
      }>
      {confirm ? (
        <div className="space-y-3 text-[13px]">
          <p>Hapus folder <b>{state.name}</b>?</p>
          {count(state.key) > 0 && (
            <Field label={`Pindahkan ${count(state.key)} akun ke`}>
              <select className="h-9 w-full rounded-[10px] border border-border bg-bg px-3 text-[13px]" value={reassign} onChange={(e) => setReassign(e.target.value)}>
                {others.map((f) => <option key={f.key} value={f.key}>{f.name}</option>)}
              </select>
            </Field>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Nama folder"><Input autoFocus value={state.name} onChange={(e) => setState({ ...state, name: e.target.value })} placeholder="mis. Netflix" /></Field>
          <div>
            <span className="mb-1.5 block text-[12px] font-medium text-muted-fg">Ikon</span>
            <div className="flex flex-wrap gap-1.5">
              {ICON_KEYS.map((k) => (
                <button key={k} onClick={() => setState({ ...state, icon: k })}
                  className={"grid h-9 w-9 place-items-center rounded-[10px] border transition " + (state.icon === k ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-fg hover:bg-secondary")}>
                  <FolderIcon name={k} size={16} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
