'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

type ProductLine = { value: string; count: number };

type Props = {
  brands: string[];
  productLines: ProductLine[];
  ramOptions?: number[];
  // `embedded`: omite el chrome de tarjeta (borde/fondo/sombra/padding/margen) para
  // renderizar a ras dentro de un contenedor que ya lo aporta (p.ej. el bottom-sheet
  // móvil). Por defecto false → tarjeta (uso del sidebar de escritorio).
  embedded?: boolean;
};

const DEFAULT_RAM_OPTIONS = [8, 16, 32];
const DEBOUNCE_MS = 300;

// Pills booleanas sobre columnas de `specs`. La clave es el searchParam (?gaming=1).
const FEATURE_PILLS = [
  { key: 'gaming', label: 'Gaming' },
  { key: 'ai', label: 'Optimizado para IA' },
  { key: 'oled', label: 'OLED' },
] as const;

// Estado del producto (tri-estado, searchParam `?cond=`). Vacío = todos.
const CONDITION_OPTIONS = [
  { key: 'nuevos', label: 'Nuevos' },
  { key: 'reacond', label: 'Reacondicionados' },
] as const;

// Buckets de tamaño de pantalla. La `key` es la del searchParam `?screen=` y debe
// coincidir con SCREEN_BUCKETS de app/page.tsx (que la traduce a rango min/max).
const SCREEN_OPTIONS = [
  { key: '13', label: '13″' },
  { key: '14', label: '14″' },
  { key: '15-16', label: '15-16″' },
  { key: '17', label: '17″' },
] as const;

export function LaptopFilters({
  brands,
  productLines,
  ramOptions = DEFAULT_RAM_OPTIONS,
  embedded = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // El buscador de texto (?q=) vive ahora en el hero de la home (HomeHero), que es el
  // ÚNICO buscador del sitio (filtra en vivo + lanza la IA). Aquí solo el precio.
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

  // Debounce del precio hacia la URL (300 ms). Solo empuja si difiere de la URL, para
  // no resetear la página al montar.
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

  function setScreen(value: string | null) {
    pushParam('screen', value);
  }

  function setLine(value: string | null) {
    pushParam('line', value);
  }

  function setCond(value: string | null) {
    pushParam('cond', value);
  }

  function clearAll() {
    setPriceMax('');
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  }

  // Valores derivados de la URL (recalculados en cada render; el compiler memoiza).
  const selectedBrands = new Set((searchParams.get('brand') ?? '').split(',').filter(Boolean));
  const currentRamMin = Number(searchParams.get('ram_min') ?? '') || 0;
  const currentScreen = searchParams.get('screen') ?? '';
  const currentLine = searchParams.get('line') ?? '';
  const currentCond = searchParams.get('cond') ?? '';
  const anyFeature = FEATURE_PILLS.some((f) => searchParams.get(f.key) === '1');
  const anyActive =
    (searchParams.get('q') ?? '') !== '' ||
    selectedBrands.size > 0 ||
    currentRamMin > 0 ||
    currentScreen !== '' ||
    currentLine !== '' ||
    currentCond !== '' ||
    priceMax !== '' ||
    anyFeature;

  return (
    <section
      aria-label="Filtros de portátiles"
      className={
        embedded
          ? 'space-y-4'
          : 'mb-6 space-y-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950'
      }
    >
      {/* Búsqueda + precio + limpiar en una fila */}
      <div className="flex flex-wrap items-end gap-3">
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
            className="mt-1 block w-32 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 dark:border-zinc-700 dark:bg-zinc-900"
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
                  'a11y-tap inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs transition-colors ' +
                  (active
                    ? 'border-cyan-500 bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300'
                    : 'border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900')
                }
              >
                {brand}
              </button>
            );
          })}
        </div>
      </div>

      {/* Serie (product_line) */}
      {productLines.length > 0 && (
        <div>
          <label htmlFor="filter-line" className="mb-1.5 block text-xs font-medium text-zinc-500">
            Serie
          </label>
          <select
            id="filter-line"
            value={currentLine}
            onChange={(e) => setLine(e.target.value || null)}
            className="block w-full max-w-xs rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">Todas las series</option>
            {productLines.map(({ value, count }) => (
              <option key={value} value={value}>
                {value} ({count})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* RAM mínima */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-zinc-500">RAM mínima</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setRamMin(null)}
            aria-pressed={currentRamMin === 0}
            className={
              'a11y-tap inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs transition-colors ' +
              (currentRamMin === 0
                ? 'border-cyan-500 bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300'
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
                  'a11y-tap inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs transition-colors ' +
                  (active
                    ? 'border-cyan-500 bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300'
                    : 'border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900')
                }
              >
                {v} GB+
              </button>
            );
          })}
        </div>
      </div>

      {/* Tamaño de pantalla */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-zinc-500">Tamaño de pantalla</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setScreen(null)}
            aria-pressed={currentScreen === ''}
            className={
              'a11y-tap inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs transition-colors ' +
              (currentScreen === ''
                ? 'border-cyan-500 bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300'
                : 'border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900')
            }
          >
            Cualquiera
          </button>
          {SCREEN_OPTIONS.map(({ key, label }) => {
            const active = currentScreen === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setScreen(key)}
                aria-pressed={active}
                className={
                  'a11y-tap inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs transition-colors ' +
                  (active
                    ? 'border-cyan-500 bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300'
                    : 'border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900')
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Estado del producto (nuevos / reacondicionados / todos) */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-zinc-500">Estado</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCond(null)}
            aria-pressed={currentCond === ''}
            className={
              'a11y-tap inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs transition-colors ' +
              (currentCond === ''
                ? 'border-cyan-500 bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300'
                : 'border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900')
            }
          >
            Todos
          </button>
          {CONDITION_OPTIONS.map(({ key, label }) => {
            const active = currentCond === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setCond(key)}
                aria-pressed={active}
                className={
                  'a11y-tap inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs transition-colors ' +
                  (active
                    ? 'border-cyan-500 bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300'
                    : 'border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900')
                }
              >
                {label}
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
                  'a11y-tap inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs transition-colors ' +
                  (active
                    ? 'border-cyan-500 bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300'
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
