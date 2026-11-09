import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export function WarehouseModal({ title, children, onClose, busy = false }) {
  const dialog = useRef(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !busyRef.current) { event.preventDefault(); closeRef.current(); }
      if (event.key === "Tab") {
        const elements = [...dialog.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')];
        const first = elements[0];
        const last = elements.at(-1);
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm p-3 sm:p-6 flex items-center justify-center">
    <section ref={dialog} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
      className="bg-surface border border-foreground/10 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90dvh] flex flex-col min-w-0 outline-none">
      <div className="flex items-center justify-between gap-3 border-b border-foreground/10 p-4 sm:p-6">
        <h2 className="text-xl sm:text-2xl font-black break-words min-w-0">{title}</h2>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Cerrar" className="p-2 rounded-xl hover:bg-background disabled:opacity-50"><X size={22} /></button>
      </div>
      <div className="p-4 sm:p-6 overflow-y-auto min-w-0">{children}</div>
    </section>
  </div>;
}
