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
    <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
    <li className="sm:col-span-2 lg:col-span-3">
      <button
        type="button"
        onClick={toggleOpen}
        aria-expanded={open}
        className="flex w-full items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-3 text-left shadow-sm transition-all hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
      >
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-zinc-50 dark:bg-zinc-900">
          {series.image_url ? (
            <Image
              src={pccThumb(series.image_url, 300)}
              alt={`${series.brand} ${series.model}`}
              fill
              sizes="80px"
              className="object-contain p-2"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[10px] text-zinc-400">Sin imagen</div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-400">
            {series.brand}
          </p>
          <h2 className="truncate font-display text-base font-bold leading-tight">
            {series.seriesKey ?? series.model}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2 py-0.5 text-[11px] font-semibold text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">
              <Layers className="h-3 w-3" aria-hidden /> {series.configCount} configuraciones
            </span>
            {chips.slice(0, 3).map((c) => (
              <span
                key={c}
                className="rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
              >
                {c}
              </span>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1 pr-1">
          {series.minPriceEur !== null && (
            <span className="font-display text-lg font-extrabold tabular-nums">
              <span className="mr-1 text-xs font-normal text-zinc-500">Desde</span>
              {formatEur(series.minPriceEur)}
            </span>
          )}
          <ChevronDown
            className={'h-5 w-5 text-zinc-400 transition-transform ' + (open ? 'rotate-180' : '')}
            aria-hidden
          />
        </div>
      </button>

      {open && (
        <div className="mt-3">
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
        </div>
      )}
    </li>
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
