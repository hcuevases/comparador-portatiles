'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

type Props = {
  brands: string[];
  ramOptions?: number[];
};

const DEFAULT_RAM_OPTIONS = [8, 16, 32];
const DEBOUNCE_MS = 300;

// Pills booleanas sobre columnas de `specs`. La clave es el searchParam (?gaming=1).
const FEATURE_PILLS = [
  { key: 'gaming', label: 'Gaming' },
  { key: 'ai', label: 'Optimizado para IA' },
  { key: 'oled', label: 'OLED' },
  { key: 'refurbished', label: 'Reacondicionado' },
] as const;

export function LaptopFilters({ brands, ramOptions = DEFAULT_RAM_OPTIONS }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Estado local solo para los inputs editables (debounced hacia la URL).
  // Los pills (brand, ram_min) se leen directamente de searchParams.
  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const [priceMax, setPriceMax] = useState(searchParams.get('price_max') ?? '');

  // Empuja un único par key/value al URL. Declarado antes de los useEffect que lo usan.
  // Cualquier cambio de filtro resetea `page` para evitar quedarse en una página
  // que ya no existe tras filtrar.
  function pushParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null || value === '') params.delete(key);
    else params.set(key, value);
    params.delete('page');
    const next = params.toString();
    startTransition(() => {
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    });
  }

  // Debounce: cada cambio en `q` o `priceMax` se compromete al URL tras 300 ms sin tecla.
  // Solo empujamos si el valor local DIFIERE del de la URL. Sin esta guarda, el
  // efecto dispara al montar el componente (al volver a la home desde otra ruta)
  // y, como `pushParam` borra `page`, te saca de la página en la que estabas.
  useEffect(() => {
    const t = setTimeout(() => {
      if (q !== (searchParams.get('q') ?? '')) pushParam('q', q || null);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
    // pushParam es estable a nivel de render; el resto de deps lo capta el React Compiler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (priceMax !== (searchParams.get('price_max') ?? '')) {
        pushParam('price_max', priceMax || null);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceMax]);

  function toggleBrand(brand: string) {
    const params = new URLSearchParams(searchParams.toString());
    const current = new Set((params.get('brand') ?? '').split(',').filter(Boolean));
    if (current.has(brand)) current.delete(brand);
    else current.add(brand);
    if (current.size === 0) params.delete('brand');
    else params.set('brand', Array.from(current).join(','));
    params.delete('page');
    const next = params.toString();
    startTransition(() => {
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    });
  }

  function setRamMin(value: number | null) {
    pushParam('ram_min', value ? String(value) : null);
  }

  function toggleFlag(key: string) {
    pushParam(key, searchParams.get(key) === '1' ? null : '1');
  }

  function clearAll() {
    setQ('');
    setPriceMax('');
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  }

  // Valores derivados de la URL (recalculados en cada render; el compiler memoiza).
  const selectedBrands = new Set((searchParams.get('brand') ?? '').split(',').filter(Boolean));
  const currentRamMin = Number(searchParams.get('ram_min') ?? '') || 0;
  const anyFeature = FEATURE_PILLS.some((f) => searchParams.get(f.key) === '1');
  const anyActive =
    q !== '' ||
    selectedBrands.size > 0 ||
    currentRamMin > 0 ||
    priceMax !== '' ||
    anyFeature;

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

      {/* Características (filtran columnas de specs vía inner join en la home) */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-zinc-500">Características</p>
        <div className="flex flex-wrap gap-1.5">
          {FEATURE_PILLS.map(({ key, label }) => {
            const active = searchParams.get(key) === '1';
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleFlag(key)}
                aria-pressed={active}
                className={
                  'rounded-full border px-3 py-1 text-xs transition-colors ' +
                  (active
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                    : 'border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900')
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
