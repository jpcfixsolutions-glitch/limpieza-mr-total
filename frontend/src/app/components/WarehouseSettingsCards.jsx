import { Plus, Pencil, Trash2, RotateCcw } from 'lucide-react';

export function SettingsSectionCard({ id, icon: Icon, title, description, addLabel, onAdd, children, footer }) {
  return <section aria-labelledby={id} className="min-w-0 rounded-3xl border border-foreground/10 bg-surface p-4 shadow-sm sm:p-6 flex flex-col">
    <header className="flex items-start justify-between gap-3 border-b border-foreground/10 pb-5 mb-5">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/8 text-primary"><Icon size={23} aria-hidden="true" /></span>
        <div className="min-w-0 pt-1"><h2 id={id} className="text-lg sm:text-xl font-black leading-tight text-primary">{title}</h2><p className="mt-2 text-sm leading-relaxed text-foreground/60">{description}</p></div>
      </div>
      <button type="button" onClick={onAdd} aria-label={addLabel} title={addLabel} className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white shadow-sm transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary/40"><Plus size={22} aria-hidden="true" /></button>
    </header>
    <div className="space-y-3">{children}</div>
    {footer && <footer className="mt-auto pt-5"><div className="border-t border-foreground/10 pt-4 text-xs leading-relaxed text-foreground/60">{footer}</div></footer>}
  </section>;
}

export function SettingsItemCard({ name, value, valueLabel, active, description, metadata, onEdit, onToggle }) {
  const actionClass = 'flex size-11 shrink-0 items-center justify-center rounded-xl border border-foreground/10 bg-white/75 transition-colors focus-visible:ring-2 focus-visible:ring-primary/40';
  const toggleLabel = `${active ? 'Desactivar' : 'Reactivar'} ${name}`;
  return <article className="rounded-2xl border border-[#cbd8e8] bg-[#eaf0f8] p-4 shadow-sm transition-shadow hover:shadow-md">
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="min-w-0 flex-1 basis-36">
        <h3 className="font-bold leading-snug text-foreground [overflow-wrap:anywhere]">{name}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-foreground/60"><span className={`inline-flex items-center gap-1.5 font-semibold ${active ? 'text-emerald-800' : 'text-foreground/60'}`}><span aria-hidden="true" className={`size-1.5 rounded-full ${active ? 'bg-emerald-600' : 'bg-slate-400'}`} />{active ? 'Activo' : 'Inactivo'}</span>{metadata && <><span aria-hidden="true">·</span><span>{metadata}</span></>}</div>
        {description && <p className="mt-2 text-xs leading-relaxed text-foreground/60 [overflow-wrap:anywhere]">{description}</p>}
      </div>
      <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-3">
        <div className="min-w-0 text-right"><p className="text-[10px] font-bold uppercase tracking-wider text-foreground/50">{valueLabel}</p><p className="mt-0.5 text-lg font-black tabular-nums [overflow-wrap:anywhere]">{value}</p></div>
        <div className="flex gap-1.5">
          <button type="button" className={`${actionClass} text-foreground/65 hover:bg-white hover:text-primary`} onClick={onEdit} aria-label={`Editar ${name}`} title={`Editar ${name}`}><Pencil size={18} aria-hidden="true" /></button>
          <button type="button" className={`${actionClass} ${active ? 'text-primary hover:bg-red-50' : 'text-emerald-800 hover:bg-emerald-50'}`} onClick={onToggle} aria-label={toggleLabel} title={toggleLabel}>{active ? <Trash2 size={18} aria-hidden="true" /> : <RotateCcw size={18} aria-hidden="true" />}</button>
        </div>
      </div>
    </div>
  </article>;
}

export function SettingsEmptyState({ icon: Icon, title, description }) {
  return <div className="flex flex-col items-center rounded-2xl border border-dashed border-foreground/15 bg-background/60 px-5 py-10 text-center">
    <span className="mb-3 rounded-2xl bg-elevated/50 p-3 text-foreground/45"><Icon size={26} aria-hidden="true" /></span>
    <p className="font-bold">{title}</p><p className="mt-2 max-w-xs text-sm leading-relaxed text-foreground/60">{description}</p>
  </div>;
}
