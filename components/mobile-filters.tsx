'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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

// Duración (ms) de la animación de apertura/cierre del sheet. Debe coincidir con la clase
// `duration-300` de la transición para desmontar justo cuando termina de salir.
const ANIM_MS = 300;

export function MobileFilters({ brands, productLines, ramOptions, total }: Props) {
  // `mounted` = está en el DOM (incluye la animación de salida). `shown` = posición/opacidad
  // visibles (objetivo de la transición). Dos estados para poder animar también el cierre.
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const searchParams = useSearchParams();
  const activeCount = countActiveFilters(searchParams);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);

  const openSheet = useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setMounted(true);
    // Doble rAF: garantiza que el primer paint sea con el estado oculto (translate-y-full)
    // antes de pasar a `shown`, para que la transición de entrada se vea.
    requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
  }, []);

  const closeSheet = useCallback(() => {
    setShown(false); // dispara la transición de salida
    closeTimer.current = window.setTimeout(() => {
      setMounted(false);
      closeTimer.current = null;
    }, ANIM_MS);
  }, []);

  // Mientras el sheet está montado: bloquea el scroll del body, enfoca el botón cerrar y
  // escucha teclado (Escape cierra; Tab queda atrapado dentro del diálogo). El cleanup
  // restaura todo (y limpia el timer) aunque el componente se desmonte abierto.
  useEffect(() => {
    if (!mounted) return;
    const opener = document.activeElement as HTMLElement | null; // para devolver el foco al cerrar
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeSheet();
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
  }, [mounted, closeSheet]);

  return (
    <div className="md:hidden">
      {/* Barra sticky con el botón de filtros (accesible al hacer scroll del grid). */}
      <div className="sticky top-0 z-30 -mx-4 mb-4 border-b border-zinc-200 bg-white/95 px-4 py-2 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <button
          type="button"
          onClick={openSheet}
          aria-haspopup="dialog"
          aria-expanded={mounted}
          className="a11y-tap flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-cyan-700"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M3 5h18M6 12h12M10 19h4" />
          </svg>
          Filtros
          {activeCount > 0 && (
            <span
              aria-label={`${activeCount} ${activeCount === 1 ? 'filtro activo' : 'filtros activos'}`}
              className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-white px-1.5 text-xs font-bold text-cyan-700"
            >
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {mounted && (
        <>
          <div
            onClick={closeSheet}
            aria-hidden="true"
            className={
              'fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 motion-reduce:transition-none ' +
              (shown ? 'opacity-100' : 'opacity-0')
            }
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-filters-title"
            className={
              'fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-2xl bg-white shadow-xl transition-transform duration-300 ease-out motion-reduce:transition-none dark:bg-zinc-950 ' +
              (shown ? 'translate-y-0' : 'translate-y-full')
            }
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <h2 id="mobile-filters-title" className="text-sm font-semibold">
                Filtros
              </h2>
              <button
                ref={closeRef}
                type="button"
                onClick={closeSheet}
                aria-label="Cerrar filtros"
                className="a11y-tap rounded-full p-1 text-lg leading-none text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                ✕
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <LaptopFilters brands={brands} productLines={productLines} ramOptions={ramOptions} embedded />
            </div>

            <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
              <button
                type="button"
                onClick={closeSheet}
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
