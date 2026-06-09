'use client';

import { useCompareSelection } from '@/lib/use-compare-selection';

// Botón de la ficha individual para añadir/quitar el portátil de la selección
// de comparación. Comparte estado con el grid y la barra flotante vía
// useCompareSelection() (localStorage), así que la selección persiste al volver
// al catálogo.
export function AddToCompareButton({ laptopId }: { laptopId: string }) {
  const { toggle, isSelected, isFull, max } = useCompareSelection();
  const selected = isSelected(laptopId);
  const disabled = !selected && isFull;

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => toggle(laptopId)}
        disabled={disabled}
        aria-pressed={selected}
        className={
          'inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors ' +
          (selected
            ? 'border-cyan-500 bg-cyan-50 text-cyan-700 hover:bg-cyan-100 dark:bg-cyan-950 dark:text-cyan-300 dark:hover:bg-cyan-900'
            : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900') +
          (disabled ? ' cursor-not-allowed opacity-50' : '')
        }
      >
        {selected ? '✓ En tu comparativa' : '+ Añadir a comparar'}
      </button>
      {disabled && (
        <p className="mt-1.5 text-xs text-zinc-500">
          Máximo {max} portátiles. Quita alguno para añadir este.
        </p>
      )}
    </div>
  );
}
