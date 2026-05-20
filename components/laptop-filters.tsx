'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';

type Props = {
  brands: string[];
  ramOptions?: number[];
};

const DEFAULT_RAM_OPTIONS = [8, 16, 32];
const DEBOUNCE_MS = 300;

export function LaptopFilters({ brands, ramOptions = DEFAULT_RAM_OPTIONS }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Snapshot inicial desde URL.
  const initialQ = searchParams.get('q') ?? '';
  const initialBrands = new Set((searchParams.get('brand') ?? '').split(',').filter(Boolean));
  const initialRamMin = Number(searchParams.get('ram_min') ?? '') || 0;
  const initialPriceMax = searchParams.get('price_max') ?? '';

  const [q, setQ] = useState(initialQ);
  const [priceMax, setPriceMax] = useState(initialPriceMax);

  // Empuja la búsqueda al URL con debounce para no martillear al server.
  useEffect(() => {
    const t = setTimeout(() => {
      pushParam('q', q || null);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // Precio: misma idea con debounce.
  useEffect(() => {
    const t = setTimeout(() => {
      pushParam('price_max', priceMax || null);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceMax]);

  const pushParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === null || value === '') params.delete(key);
      else params.set(key, value);
      const next = params.toString();
      startTransition(() => {
        router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  const toggleBrand = (brand: string) => {
    const params = new URLSearchParams(searchParams.toString());
    const current = new Set((params.get('brand') ?? '').split(',').filter(Boolean));
    if (current.has(brand)) current.delete(brand);
    else current.add(brand);
    if (current.size === 0) params.delete('brand');
    else params.set('brand', Array.from(current).join(','));
    const next = params.toString();
    startTransition(() => {
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    });
  };

  const setRamMin = (value: number | null) => {
    pushParam('ram_min', value ? String(value) : null);
  };

  const selectedBrands = useMemo(
    () => new Set((searchParams.get('brand') ?? '').split(',').filter(Boolean)),
    [searchParams],
  );
  const currentRamMin = Number(searchParams.get('ram_min') ?? '') || 0;

  const anyActive =
    q !== '' || selectedBrands.size > 0 || currentRamMin > 0 || priceMax !== '';

  const clearAll = () => {
    setQ('');
    setPriceMax('');
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  };

  return (
    <section
      aria-label="Filtros de portátiles"
      className="mb-6 space-y-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
    >
      {/* Búsqueda + precio + limpiar en una fila */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor="filter-q" className="block text-xs font-medium text-zinc-500">
            Buscar
          </label>
          <input
            id="filter-q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Marca o modelo (ej: ThinkPad, MacBook)"
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>

        <div>
          <label htmlFor="filter-price" className="block text-xs font-medium text-zinc-500">
            Precio máx. (€)
          </label>
          <input
            id="filter-price"
            type="number"
            min="0"
            step="100"
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            placeholder="Sin límite"
            className="mt-1 block w-32 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>

        {anyActive && (
          <button
            type="button"
            onClick={clearAll}
            className="self-end text-xs text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            limpiar filtros
          </button>
        )}
      </div>

      {/* Marcas */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-zinc-500">Marca</p>
        <div className="flex flex-wrap gap-1.5">
          {brands.map((brand) => {
            const active = selectedBrands.has(brand);
            return (
              <button
                key={brand}
                type="button"
                onClick={() => toggleBrand(brand)}
                aria-pressed={active}
                className={
                  'rounded-full border px-3 py-1 text-xs transition-colors ' +
                  (active
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                    : 'border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900')
                }
              >
                {brand}
              </button>
            );
          })}
        </div>
      </div>

      {/* RAM mínima */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-zinc-500">RAM mínima</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setRamMin(null)}
            aria-pressed={currentRamMin === 0}
            className={
              'rounded-full border px-3 py-1 text-xs transition-colors ' +
              (currentRamMin === 0
                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                : 'border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900')
            }
          >
            Cualquiera
          </button>
          {ramOptions.map((v) => {
            const active = currentRamMin === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setRamMin(v)}
                aria-pressed={active}
                className={
                  'rounded-full border px-3 py-1 text-xs transition-colors ' +
                  (active
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                    : 'border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900')
                }
              >
                {v} GB+
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
