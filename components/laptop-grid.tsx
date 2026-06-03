'use client';

import Image from 'next/image';
import Link from 'next/link';

import { pccThumb } from '@/lib/images';
import type { Tables } from '@/lib/supabase/database.types';
import { useCompareSelection } from '@/lib/use-compare-selection';

// Subconjunto de columnas que pintamos en la tarjeta. Derivado del esquema
// generado para que cambios de tipo en specs se propaguen automáticamente.
type CardSpecs = Pick<
  Tables<'specs'>,
  'cpu' | 'ram_gb' | 'storage_gb' | 'screen_inches' | 'weight_kg'
>;

export type LaptopCard = Pick<
  Tables<'laptops'>,
  'id' | 'slug' | 'brand' | 'model' | 'year' | 'image_url'
> & {
  specs: CardSpecs | null;
  minPriceEur: number | null;
};

export function LaptopGrid({
  laptops,
  backQuery,
}: {
  laptops: LaptopCard[];
  // Query string de la home (página + filtros) que se propaga a la ficha como
  // `?from=` para que su enlace "Volver al catálogo" recuerde el origen.
  backQuery?: string;
}) {
  const { toggle, isSelected, isFull } = useCompareSelection();

  return (
    <>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {laptops.map((l) => {
          const selected = isSelected(l.id);
          const disabled = !selected && isFull;
          // Reacondicionado: el slug acaba en `-refurbished` (lo garantiza el
          // scraper, ver migración 0007/0009). El modelo también lo dice, pero
          // el <h2> hace truncate y lo oculta, así que el badge sí aporta.
          const refurbished = l.slug.endsWith('-refurbished');
          return (
            <li
              key={l.id}
              className={
                'relative rounded-lg border bg-white shadow-sm transition-colors dark:bg-zinc-950 ' +
                (selected
                  ? 'border-blue-500 ring-2 ring-blue-500/20'
                  : 'border-zinc-200 dark:border-zinc-800')
              }
            >
              {/* Checkbox absoluto: vive fuera del Link en el DOM, sin nested interactives. */}
              <label
                className={
                  'absolute right-3 top-3 z-10 flex shrink-0 cursor-pointer select-none items-center gap-1.5 rounded-md border px-2 py-1 text-xs ' +
                  (selected
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                    : 'border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900') +
                  (disabled ? ' cursor-not-allowed opacity-50' : '')
                }
              >
                <input
                  type="checkbox"
                  className="h-3 w-3 accent-blue-600"
                  checked={selected}
                  onChange={() => toggle(l.id)}
                  disabled={disabled}
                />
                {selected ? 'Añadido' : 'Comparar'}
              </label>

              <Link
                href={
                  backQuery
                    ? `/portatiles/${l.slug}?from=${encodeURIComponent(backQuery)}`
                    : `/portatiles/${l.slug}`
                }
                className="block hover:bg-zinc-50/50 dark:hover:bg-zinc-900/40"
              >
                {/* Imagen del producto (con fallback si no hay). Altura fija
                    para que las cards estén alineadas independientemente del
                    aspect ratio de cada imagen. object-contain para no recortar. */}
                <div className="relative h-40 w-full overflow-hidden rounded-t-lg bg-zinc-50 dark:bg-zinc-900">
                  {refurbished && (
                    <span className="absolute left-2 top-2 z-10 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      Reacondicionado
                    </span>
                  )}
                  {l.image_url ? (
                    <Image
                      src={pccThumb(l.image_url, 300)}
                      alt={`${l.brand} ${l.model}`}
                      fill
                      sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                      className="object-contain p-3"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-zinc-400">
                      Sin imagen
                    </div>
                  )}
                </div>

                <div className="p-4 pr-24">
                <div className="min-w-0">
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">{l.brand}</p>
                  <h2 className="truncate text-lg font-medium leading-tight">{l.model}</h2>
                  {l.year && (
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{l.year}</p>
                  )}
                </div>

                {l.specs && (
                  <dl className="mt-3 grid grid-cols-2 gap-y-1 text-xs text-zinc-700 dark:text-zinc-300">
                    {l.specs.cpu && (
                      <>
                        <dt className="text-zinc-500">CPU</dt>
                        <dd className="truncate">{l.specs.cpu}</dd>
                      </>
                    )}
                    {l.specs.ram_gb !== null && (
                      <>
                        <dt className="text-zinc-500">RAM</dt>
                        <dd>{l.specs.ram_gb} GB</dd>
                      </>
                    )}
                    {l.specs.storage_gb !== null && (
                      <>
                        <dt className="text-zinc-500">SSD</dt>
                        <dd>{l.specs.storage_gb} GB</dd>
                      </>
                    )}
                    {l.specs.screen_inches !== null && (
                      <>
                        <dt className="text-zinc-500">Pantalla</dt>
                        <dd>{l.specs.screen_inches}″</dd>
                      </>
                    )}
                    {l.specs.weight_kg !== null && (
                      <>
                        <dt className="text-zinc-500">Peso</dt>
                        <dd>{l.specs.weight_kg} kg</dd>
                      </>
                    )}
                  </dl>
                )}

                {l.minPriceEur !== null ? (
                  <p className="mt-3 text-sm font-medium">Desde {formatEur(l.minPriceEur)}</p>
                ) : (
                  <p className="mt-3 text-xs text-zinc-400">Sin precio aún</p>
                )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function formatEur(value: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}
