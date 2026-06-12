'use client';

import { Check, Plus } from 'lucide-react';

import { useCompareSelection, type CompareItem } from '@/lib/use-compare-selection';

// Botón de la ficha individual para añadir/quitar el portátil de la selección
// de comparación. Comparte estado con el grid y la cesta flotante vía
// useCompareSelection() (localStorage), así que la selección persiste al volver
// al catálogo.
export function AddToCompareButton({ laptop }: { laptop: CompareItem }) {
  const { toggle, isSelected, isFull, max } = useCompareSelection();
  const selected = isSelected(laptop.id);
  const disabled = !selected && isFull;

  return (
    <div>
      <button
        type="button"
        onClick={() => toggle(laptop)}
        disabled={disabled}
        aria-pressed={selected}
        className={
          'inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold shadow-sm transition-all ' +
          (selected
            ? 'border-cyan-500 bg-cyan-500 text-white shadow-cyan-500/25 hover:bg-cyan-600'
            : 'border-zinc-300 bg-white text-zinc-700 hover:border-cyan-400 hover:text-cyan-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-cyan-500 dark:hover:text-cyan-300') +
          (disabled ? ' cursor-not-allowed opacity-50' : '')
        }
      >
        {selected ? (
          <>
            <Check className="h-4 w-4" aria-hidden /> En tu comparativa
          </>
        ) : (
          <>
            <Plus className="h-4 w-4" aria-hidden /> Añadir a comparar
          </>
        )}
      </button>
      {disabled && (
        <p className="mt-1.5 text-xs text-zinc-500">
          Máximo {max} portátiles. Quita alguno para añadir este.
        </p>
      )}
    </div>
  );
}
