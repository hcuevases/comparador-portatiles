'use client';

import Image from 'next/image';
import Link from 'next/link';

import { pccThumb } from '@/lib/images';
import { useCompareSelection, type CompareItem } from '@/lib/use-compare-selection';

// Cesta flotante global de comparación. Montada en el layout raíz, aparece en
// cualquier página cuando hay al menos un portátil seleccionado. El estado vive
// en useCompareSelection() (localStorage), así que persiste al navegar.
export function CompareBar() {
  const { items, ids, count, remove, clear, max } = useCompareSelection();

  if (count === 0) return null;

  const canCompare = count >= 2;
  const compareUrl = `/comparar?ids=${ids.join(',')}`;
  const emptySlots = Math.max(0, max - count);

  return (
    <>
      {/* Espaciador en flujo normal para que el final de la página no quede
          oculto bajo la cesta fija. */}
      <div aria-hidden className="h-36" />

      <div className="fixed inset-x-0 bottom-0 z-30 px-3 pb-3 sm:px-6 sm:pb-5">
        <div className="animate-bar-in mx-auto max-w-4xl overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/70 shadow-2xl shadow-zinc-900/15 ring-1 ring-black/5 backdrop-blur-xl dark:border-zinc-700/60 dark:bg-zinc-900/70 dark:shadow-black/50">
          {/* Línea de acento superior */}
          <div
            aria-hidden
            className="h-1 w-full bg-gradient-to-r from-cyan-400 via-cyan-300 to-emerald-300"
          />

          <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-4">
            {/* Miniaturas + huecos */}
            <div className="flex min-w-0 items-center gap-2.5 overflow-x-auto no-scrollbar p-1.5">
              {items.map((item) => (
                <Thumb key={item.id} item={item} onRemove={() => remove(item.id)} />
              ))}
              {Array.from({ length: emptySlots }).map((_, i) => (
                <div
                  key={`slot-${i}`}
                  aria-hidden
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-zinc-200 text-lg text-zinc-300 dark:border-zinc-700 dark:text-zinc-600"
                >
                  +
                </div>
              ))}
            </div>

            {/* Acciones */}
            <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
              <div className="flex flex-col">
                <span className="text-sm font-semibold leading-tight">
                  {count} <span className="font-normal text-zinc-500">de {max}</span>
                </span>
                <button
                  type="button"
                  onClick={clear}
                  className="text-left text-xs text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  vaciar
                </button>
              </div>

              {canCompare ? (
                <Link
                  href={compareUrl}
                  className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-500/25 transition-all hover:scale-[1.03] hover:bg-cyan-700 active:scale-100"
                >
                  Comparar
                  <span aria-hidden>→</span>
                </Link>
              ) : (
                <span className="max-w-32 text-xs leading-tight text-zinc-500">
                  Añade 1 portátil más para comparar
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Thumb({ item, onRemove }: { item: CompareItem; onRemove: () => void }) {
  return (
    <div className="animate-pop-in group/thumb relative shrink-0">
      <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950">
        {item.image_url ? (
          <Image
            src={pccThumb(item.image_url, 150)}
            alt={`${item.brand} ${item.model}`}
            width={56}
            height={56}
            className="h-full w-full object-contain p-1.5"
          />
        ) : (
          <span className="px-1 text-center text-[9px] leading-tight text-zinc-400">
            {item.model || '—'}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Quitar ${item.brand} ${item.model}`}
        title="Quitar"
        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-zinc-200 bg-white text-xs leading-none text-zinc-500 shadow-sm transition-colors hover:bg-red-500 hover:text-white dark:border-zinc-700 dark:bg-zinc-900"
      >
        ×
      </button>
    </div>
  );
}
