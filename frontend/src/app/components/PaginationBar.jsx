import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

export const PAGE_SIZE = 25;

export function byNameEs(a, b) {
  return String(a || "").localeCompare(String(b || ""), "es", { sensitivity: "base" });
}

export function paginate(list, page, pageSize = PAGE_SIZE) {
  const total = list.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), pageCount);
  const startIdx = (safePage - 1) * pageSize;
  return {
    page: safePage,
    pageCount,
    slice: list.slice(startIdx, startIdx + pageSize),
    start: total === 0 ? 0 : startIdx + 1,
    end: Math.min(startIdx + pageSize, total),
    total,
  };
}

export function PaginationBar({ page, pageCount, total, start, end, onPageChange }) {
  if (total === 0) return null;

  const btn =
    "h-9 w-9 rounded-lg flex items-center justify-center font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-elevated text-foreground hover:bg-primary border border-foreground/15";

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 px-1">
      <p className="text-foreground/70 font-medium text-sm">
        Mostrando {start}-{end} de {total}
      </p>
      {pageCount > 1 && (
        <div className="flex items-center gap-1.5">
          <button type="button" className={btn} disabled={page <= 1} onClick={() => onPageChange(1)} title="Primera">
            <ChevronsLeft size={16} />
          </button>
          <button type="button" className={btn} disabled={page <= 1} onClick={() => onPageChange(page - 1)} title="Anterior">
            <ChevronLeft size={16} />
          </button>
          <span className="text-foreground font-bold text-sm px-3 whitespace-nowrap">
            {page} / {pageCount}
          </span>
          <button type="button" className={btn} disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} title="Siguiente">
            <ChevronRight size={16} />
          </button>
          <button type="button" className={btn} disabled={page >= pageCount} onClick={() => onPageChange(pageCount)} title="Última">
            <ChevronsRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
