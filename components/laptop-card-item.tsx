'use client';

import { Check, Plus } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { pccThumb } from '@/lib/images';
import { useCompareSelection } from '@/lib/use-compare-selection';

// Una card de configuración concreta (un laptop_id real). Lleva el checkbox de
// comparar y enlaza a su ficha. La usan las series con 1 sola config y las configs
// expandidas de una serie multi-config.
export type CardItem = {
  id: string;
  slug: string;
  brand: string;
  model: string;
  image_url: string | null;
  minPriceEur: number | null;
  chips: string[];
};

export function LaptopCardItem({ item, backQuery }: { item: CardItem; backQuery?: string }) {
  const { toggle, isSelected, isFull } = useCompareSelection();
  const selected = isSelected(item.id);
  const disabled = !selected && isFull;
  const refurbished = item.slug.endsWith('-refurbished');

  return (
    <li
      className={
        'group relative flex flex-col overflow-hidden rounded-2xl border bg-white transition-all duration-300 hover:-translate-y-1 dark:bg-zinc-950 ' +
        (selected
          ? 'border-cyan-500 shadow-lg shadow-cyan-500/20 ring-1 ring-cyan-500/40'
          : 'border-zinc-200 shadow-sm hover:border-zinc-300 hover:shadow-xl hover:shadow-zinc-900/10 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:shadow-black/50')
      }
    >
      <span
        aria-hidden
        className={
          'absolute inset-x-0 top-0 z-20 h-0.5 bg-gradient-to-r from-cyan-400 via-cyan-300 to-emerald-300 transition-opacity duration-300 ' +
          (selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')
        }
      />
      <button
        type="button"
        onClick={() => toggle({ id: item.id, brand: item.brand, model: item.model, image_url: item.image_url })}
        disabled={disabled}
        aria-pressed={selected}
        aria-label={selected ? 'Quitar de la comparativa' : 'Añadir a comparar'}
        title={
          disabled
            ? 'Máximo alcanzado: quita alguno para añadir este'
            : selected
              ? 'Quitar de la comparativa'
              : 'Añadir a comparar'
        }
        className={
          'a11y-tap absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full border text-sm font-bold shadow-sm backdrop-blur transition-all ' +
          (selected
            ? 'border-cyan-500 bg-cyan-500 text-white shadow-cyan-500/30'
            : 'border-zinc-200 bg-white/80 text-zinc-400 hover:border-cyan-400 hover:text-cyan-600 dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-500 dark:hover:text-cyan-400') +
          (disabled ? ' cursor-not-allowed opacity-40' : '')
        }
      >
        {selected ? <Check className="h-4 w-4" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
      </button>

      <Link
        href={backQuery ? `/portatiles/${item.slug}?from=${encodeURIComponent(backQuery)}` : `/portatiles/${item.slug}`}
        className="flex flex-1 flex-col"
      >
        <div className="relative h-48 w-full overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_50%_0%,var(--color-zinc-100),var(--color-white))] dark:bg-[radial-gradient(120%_120%_at_50%_0%,var(--color-zinc-800),var(--color-zinc-950))]" />
          {refurbished && (
            <span className="absolute left-3 top-3 z-10 rounded-full bg-amber-100/90 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 shadow-sm backdrop-blur dark:bg-amber-950/90 dark:text-amber-300">
              Reacondicionado
            </span>
          )}
          {item.image_url ? (
            <Image
              src={pccThumb(item.image_url, 300)}
              alt={`${item.brand} ${item.model}`}
              fill
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="relative object-contain p-5 drop-shadow-md transition-transform duration-500 ease-out group-hover:scale-[1.06]"
            />
          ) : (
            <div className="relative flex h-full items-center justify-center text-xs text-zinc-400">Sin imagen</div>
          )}
        </div>

        <div className="flex flex-1 flex-col border-t border-zinc-100 p-4 dark:border-zinc-900">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-400">
            {item.brand}
          </p>
          <h2 className="mt-0.5 truncate font-display text-lg font-bold leading-tight">{item.model}</h2>

          {item.chips.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {item.chips.map((c) => (
                <li
                  key={c}
                  className="rounded-md bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
                >
                  {c}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-auto pt-4">
            {item.minPriceEur !== null ? (
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs text-zinc-500">Desde</span>
                <span className="font-display text-2xl font-extrabold tracking-tight tabular-nums">
                  {formatEur(item.minPriceEur)}
                </span>
              </div>
            ) : (
              <span className="text-xs text-zinc-400">Sin precio aún</span>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}

export function formatEur(value: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}
