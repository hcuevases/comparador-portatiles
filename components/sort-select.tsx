'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

// Las `value` deben coincidir con los que entiende la RPC search_laptops
// (p_sort): '' = orden por defecto (marca), 'price_asc', 'price_desc'.
const SORT_OPTIONS = [
  { value: '', label: 'Marca' },
  { value: 'price_asc', label: 'Precio: de menor a mayor' },
  { value: 'price_desc', label: 'Precio: de mayor a menor' },
] as const;

// Selector de ordenación del catálogo. Escribe `?sort=` en la URL (mismo patrón
// que los filtros) y resetea `page` al cambiar.
export function SortSelect() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const current = searchParams.get('sort') ?? '';

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set('sort', value);
    else params.delete('sort');
    params.delete('page');
    const next = params.toString();
    startTransition(() => {
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    });
  }

  return (
    <label className="flex items-center gap-2 text-xs text-zinc-500">
      Ordenar:
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
