'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

export type LaptopCard = {
  id: string;
  slug: string;
  brand: string;
  model: string;
  year: number | null;
  specs: {
    cpu: string | null;
    ram_gb: number | null;
    storage_gb: number | null;
    screen_inches: number | null;
    weight_kg: number | null;
  } | null;
  minPriceEur: number | null;
};

const MAX_COMPARE = 4;

export function LaptopGrid({ laptops }: { laptops: LaptopCard[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
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
  };

  const ids = useMemo(() => Array.from(selected), [selected]);
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
                'rounded-lg border bg-white p-4 shadow-sm transition-colors dark:bg-zinc-950 ' +
                (isSelected
                  ? 'border-blue-500 ring-2 ring-blue-500/20'
                  : 'border-zinc-200 dark:border-zinc-800')
              }
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">{l.brand}</p>
                  <h2 className="truncate text-lg font-medium leading-tight">{l.model}</h2>
                  {l.year && (
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{l.year}</p>
                  )}
                </div>
                <label
                  className={
                    'flex shrink-0 cursor-pointer select-none items-center gap-1.5 rounded-md border px-2 py-1 text-xs ' +
                    (isSelected
                      ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                      : 'border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900') +
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
