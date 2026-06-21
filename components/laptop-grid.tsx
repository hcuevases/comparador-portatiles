'use client';

import { ChevronDown, Layers } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';

import { pccThumb } from '@/lib/images';
import { buildSeriesChips, formatStorage, shortCpu, type SeriesChipInput } from '@/lib/series-chips';
import { LaptopCardItem, formatEur } from '@/components/laptop-card-item';
import type { SeriesConfigRow } from '@/app/api/series/configs/route';

// Una fila del grid = una SERIE (devuelta por search_laptops). Si configCount === 1
// se pinta como card de configuración normal (con checkbox de comparar). Si > 1, card
// de serie con badge "N configuraciones" que expande inline las configs (lazy).
export type SeriesCard = {
  id: string;
  slug: string;
  brand: string;
  model: string;
  seriesKey: string | null;
  year: number | null;
  image_url: string | null;
  minPriceEur: number | null;
  configCount: number;
  chipInput: SeriesChipInput;
};

export function LaptopGrid({ laptops, backQuery }: { laptops: SeriesCard[]; backQuery?: string }) {
  return (
    <ul className="grid grid-flow-row-dense grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {laptops.map((s) =>
        s.configCount > 1 ? (
          <SeriesGroupCard key={`${s.brand}|${s.seriesKey ?? s.id}`} series={s} backQuery={backQuery} />
        ) : (
          <LaptopCardItem
            key={s.id}
            item={{
              id: s.id,
              slug: s.slug,
              brand: s.brand,
              model: s.model,
              image_url: s.image_url,
              minPriceEur: s.minPriceEur,
              chips: buildSeriesChips(s.chipInput),
            }}
            backQuery={backQuery}
          />
        ),
      )}
    </ul>
  );
}

function SeriesGroupCard({ series, backQuery }: { series: SeriesCard; backQuery?: string }) {
  const [open, setOpen] = useState(false);
  const [configs, setConfigs] = useState<SeriesConfigRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const chips = buildSeriesChips(series.chipInput);

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && configs === null && !loading) {
      setLoading(true);
      setError(false);
      try {
        const params = new URLSearchParams(backQuery ?? '');
        params.set('brand', series.brand);
        params.set('series', series.seriesKey ?? series.id);
        const res = await fetch(`/api/series/configs?${params.toString()}`);
        if (!res.ok) throw new Error('fetch failed');
        const json = (await res.json()) as { configs: SeriesConfigRow[] };
        setConfigs(json.configs);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <>
      {/* Card de serie: misma estética vertical que las demás, sin checkbox de comparar,
          con badge del nº de configuraciones. Al pulsarla expande las configs en una fila
          a todo el ancho (el <li> col-span-full de abajo). */}
      <li className="flex">
        <button
          type="button"
          onClick={toggleOpen}
          aria-expanded={open}
          className={
            'group relative flex w-full flex-col overflow-hidden rounded-2xl border bg-white text-left transition-all duration-300 hover:-translate-y-1 dark:bg-zinc-950 ' +
            (open
              ? 'border-cyan-500 shadow-lg shadow-cyan-500/20 ring-1 ring-cyan-500/40'
              : 'border-zinc-200 shadow-sm hover:border-zinc-300 hover:shadow-xl hover:shadow-zinc-900/10 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:shadow-black/50')
          }
        >
          <span
            aria-hidden
            className={
              'absolute inset-x-0 top-0 z-20 h-0.5 bg-gradient-to-r from-cyan-400 via-cyan-300 to-emerald-300 transition-opacity duration-300 ' +
              (open ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')
            }
          />
          {/* Badge del contador, en el sitio que ocupa el checkbox en las cards normales. */}
          <span className="absolute right-3 top-3 z-20 inline-flex items-center gap-1 rounded-full border border-cyan-300 bg-cyan-500/90 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm backdrop-blur dark:border-cyan-700">
            <Layers className="h-3.5 w-3.5" aria-hidden /> {series.configCount}
          </span>

          <div className="relative h-48 w-full overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_50%_0%,var(--color-zinc-100),var(--color-white))] dark:bg-[radial-gradient(120%_120%_at_50%_0%,var(--color-zinc-800),var(--color-zinc-950))]" />
            {series.image_url ? (
              <Image
                src={pccThumb(series.image_url, 300)}
                alt={`${series.brand} ${series.seriesKey ?? series.model}`}
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
              {series.brand}
            </p>
            <h2 className="mt-0.5 truncate font-display text-lg font-bold leading-tight">
              {series.seriesKey ?? series.model}
            </h2>

            {chips.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {chips.map((c) => (
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
              {series.minPriceEur !== null ? (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs text-zinc-500">Desde</span>
                  <span className="font-display text-2xl font-extrabold tracking-tight tabular-nums">
                    {formatEur(series.minPriceEur)}
                  </span>
                </div>
              ) : (
                <span className="text-xs text-zinc-400">Sin precio aún</span>
              )}
              <span className="mt-2 flex items-center gap-1 text-xs font-semibold text-cyan-700 dark:text-cyan-400">
                {open ? 'Ocultar' : 'Ver'} {series.configCount} configuraciones
                <ChevronDown className={'h-4 w-4 transition-transform ' + (open ? 'rotate-180' : '')} aria-hidden />
              </span>
            </div>
          </div>
        </button>
      </li>

      {open && (
        <li className="col-span-full">
          {loading && <p className="px-1 text-sm text-zinc-500">Cargando configuraciones…</p>}
          {error && <p className="px-1 text-sm text-red-600">No se pudieron cargar las configuraciones.</p>}
          {configs && configs.length > 0 && (
            <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {configs.map((c) => (
                <LaptopCardItem
                  key={c.id}
                  item={{
                    id: c.id,
                    slug: c.slug,
                    brand: c.brand,
                    model: c.model,
                    image_url: c.image_url,
                    minPriceEur: c.min_price,
                    chips: buildConfigChips(c),
                  }}
                  backQuery={backQuery}
                />
              ))}
            </ul>
          )}
        </li>
      )}
    </>
  );
}

// Chips de una configuración concreta (valores únicos, no rango).
function buildConfigChips(c: SeriesConfigRow): string[] {
  const chips: string[] = [];
  if (c.cpu) chips.push(shortCpu(c.cpu));
  if (c.ram_gb !== null) chips.push(`${c.ram_gb} GB RAM`);
  if (c.storage_gb !== null) chips.push(`${formatStorage(c.storage_gb)} SSD`);
  if (c.screen_inches !== null) chips.push(`${c.screen_inches}″`);
  return chips;
}
