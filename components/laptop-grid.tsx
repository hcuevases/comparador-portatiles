'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

import type { Tables } from '@/lib/supabase/database.types';

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

const MAX_COMPARE = 4;

export function LaptopGrid({ laptops }: { laptops: LaptopCard[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= MAX_COMPARE) return prev;
        next.add(id);
      }
      return next;
    });
  }

  const ids = Array.from(selected);
  const compareUrl = `/comparar?ids=${ids.join(',')}`;
  const canCompare = ids.length >= 2;

  return (
    <>
      <ul className="grid grid-cols-1 gap-4 pb-28 sm:grid-cols-2 lg:grid-cols-3">
        {laptops.map((l) => {
          const isSelected = selected.has(l.id);
          const disabled = !isSelected && selected.size >= MAX_COMPARE;
          return (
            <li
              key={l.id}
              className={
                'relative rounded-lg border bg-white shadow-sm transition-colors dark:bg-zinc-950 ' +
                (isSelected
                  ? 'border-blue-500 ring-2 ring-blue-500/20'
                  : 'border-zinc-200 dark:border-zinc-800')
              }
            >
              {/* Checkbox absoluto: vive fuera del Link en el DOM, sin nested interactives. */}
              <label
                className={
                  'absolute right-3 top-3 z-10 flex shrink-0 cursor-pointer select-none items-center gap-1.5 rounded-md border px-2 py-1 text-xs ' +
                  (isSelected
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                    : 'border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900') +
                  (disabled ? ' cursor-not-allowed opacity-50' : '')
                }
              >
                <input
                  type="checkbox"
                  className="h-3 w-3 accent-blue-600"
                  checked={isSelected}
                  onChange={() => toggle(l.id)}
                  disabled={disabled}
                />
                {isSelected ? 'Añadido' : 'Comparar'}
              </label>

              <Link
                href={`/portatiles/${l.slug}`}
                className="block hover:bg-zinc-50/50 dark:hover:bg-zinc-900/40"
              >
                {/* Imagen del producto (con fallback si no hay). Altura fija
                    para que las cards estén alineadas independientemente del
                    aspect ratio de cada imagen. object-contain para no recortar. */}
                <div className="relative h-40 w-full overflow-hidden rounded-t-lg bg-zinc-50 dark:bg-zinc-900">
                  {l.image_url ? (
                    <Image
                      src={l.image_url}
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

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-8 py-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">
                {selected.size}/{MAX_COMPARE} seleccionados
              </span>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-xs text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                limpiar
              </button>
            </div>

            {canCompare ? (
              <Link
                href={compareUrl}
                className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Comparar →
              </Link>
            ) : (
              <span className="text-xs text-zinc-500">Elige al menos 2 portátiles</span>
            )}
          </div>
        </div>
      )}
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
