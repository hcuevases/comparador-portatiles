'use client';

import Link from 'next/link';

import { useCompareSelection } from '@/lib/use-compare-selection';

// Barra flotante global de selección para comparar. Montada en el layout raíz,
// aparece en cualquier página cuando hay al menos un portátil seleccionado.
// El estado vive en useCompareSelection() (localStorage), así que persiste al
// navegar entre la home y las fichas.
export function CompareBar() {
  const { ids, count, clear, max } = useCompareSelection();

  if (count === 0) return null;

  const canCompare = count >= 2;
  const compareUrl = `/comparar?ids=${ids.join(',')}`;

  return (
    <>
      {/* Espaciador en flujo normal para que el contenido al final de la
          página no quede oculto bajo la barra fija. */}
      <div aria-hidden className="h-28" />

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-8 py-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">
              {count}/{max} seleccionados
            </span>
            <button
              type="button"
              onClick={clear}
              className="text-xs text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              limpiar
            </button>
          </div>

          {canCompare ? (
            <Link
              href={compareUrl}
              className="inline-flex items-center rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700"
            >
              Comparar →
            </Link>
          ) : (
            <span className="text-xs text-zinc-500">Elige al menos 2 portátiles</span>
          )}
        </div>
      </div>
    </>
  );
}
