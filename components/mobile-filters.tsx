'use client';

import { useEffect, useRef, useState } from 'react';

import { useSearchParams } from 'next/navigation';

import { countActiveFilters } from '@/lib/active-filters';

import { LaptopFilters } from './laptop-filters';

type ProductLine = { value: string; count: number };

type Props = {
  brands: string[];
  productLines: ProductLine[];
  ramOptions?: number[];
  total: number;
};

export function MobileFilters({ brands, productLines, ramOptions, total }: Props) {
  const [open, setOpen] = useState(false);
  const searchParams = useSearchParams();
  const activeCount = countActiveFilters(searchParams);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Mientras el sheet está abierto: bloquea el scroll del body, enfoca el botón cerrar y
  // escucha teclado (Escape cierra; Tab queda atrapado dentro del diálogo). El cleanup
  // restaura todo aunque el componente se desmonte abierto.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null; // para devolver el foco al cerrar
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      // Focus trap: el Tab no debe salir del diálogo (modal accesible, sin dependencias).
      if (e.key === 'Tab') {
        const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
      opener?.focus(); // devuelve el foco al botón que abrió el sheet
    };
  }, [open]);

  return (
    <div className="md:hidden">
      {/* Barra sticky con el botón de filtros (accesible al hacer scroll del grid). */}
      <div className="sticky top-0 z-30 -mx-4 mb-4 border-b border-zinc-200 bg-white/95 px-4 py-2 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="a11y-tap inline-flex items-center gap-2 rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          Filtros
          {activeCount > 0 && (
            <span
              aria-label={`${activeCount} ${activeCount === 1 ? 'filtro activo' : 'filtros activos'}`}
              className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-cyan-600 px-1.5 text-xs font-semibold text-white"
            >
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-filters-title"
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-2xl bg-white shadow-xl dark:bg-zinc-950"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <h2 id="mobile-filters-title" className="text-sm font-semibold">
                Filtros
              </h2>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar filtros"
                className="a11y-tap rounded-full p-1 text-lg leading-none text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                ✕
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <LaptopFilters brands={brands} productLines={productLines} ramOptions={ramOptions} />
            </div>

            <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="a11y-tap w-full rounded-lg bg-cyan-600 py-2.5 text-sm font-semibold text-white hover:bg-cyan-700"
              >
                Ver resultados ({total})
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
