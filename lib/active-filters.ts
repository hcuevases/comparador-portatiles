// Cuenta los filtros de catálogo activos a partir de los searchParams. Pura y testeable;
// la usa el badge "Filtros (N)" del bottom-sheet móvil. El buscador `?q=` vive en el hero,
// no es un filtro del panel, así que NO se cuenta. Las claves deben coincidir con las que
// emite `components/laptop-filters.tsx`.
//
// Tipa el parámetro estructuralmente (solo `.get`) para aceptar tanto `URLSearchParams`
// (tests) como el `ReadonlyURLSearchParams` que devuelve `useSearchParams()` — este último
// NO es asignable a `URLSearchParams` (le faltan set/append/delete).
type ReadableParams = { get(key: string): string | null };

const FEATURE_KEYS = ['gaming', 'ai', 'oled'] as const;
const SINGLE_VALUE_KEYS = ['ram_min', 'screen', 'line', 'cond', 'price_max'] as const;

export function countActiveFilters(params: ReadableParams): number {
  let n = 0;
  n += (params.get('brand') ?? '').split(',').filter(Boolean).length;
  for (const key of SINGLE_VALUE_KEYS) {
    if ((params.get(key) ?? '') !== '') n += 1;
  }
  for (const key of FEATURE_KEYS) {
    if (params.get(key) === '1') n += 1;
  }
  return n;
}
