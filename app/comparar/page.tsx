import Link from 'next/link';

import type { Tables } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/server';

// Derivados del esquema generado. Cambia una columna en Supabase y aquí salta TS.
type LaptopRow = Pick<Tables<'laptops'>, 'id' | 'slug' | 'brand' | 'model' | 'year'>;
type SpecRow = Pick<
  Tables<'specs'>,
  | 'laptop_id'
  | 'cpu'
  | 'cpu_cores'
  | 'ram_gb'
  | 'storage_gb'
  | 'storage_type'
  | 'gpu'
  | 'gpu_vram_gb'
  | 'screen_inches'
  | 'screen_resolution'
  | 'screen_refresh_hz'
  | 'weight_kg'
  | 'battery_wh'
  | 'ports'
  | 'os'
>;
type PriceRow = Pick<Tables<'prices_history'>, 'laptop_id' | 'price_eur'>;

const MAX_COMPARE = 4;

export default async function CompararPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids: idsParam } = await searchParams;

  const ids = (idsParam ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[0-9a-fA-F-]{36}$/.test(s))
    .slice(0, MAX_COMPARE);

  if (ids.length < 2) {
    return (
      <main className="mx-auto max-w-4xl p-8">
        <BackHome />
        <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
          <h1 className="text-lg font-medium">Necesitas al menos 2 portátiles para comparar.</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Vuelve a la home y marca de 2 a {MAX_COMPARE} portátiles.
          </p>
        </div>
      </main>
    );
  }

  const supabase = await createClient();

  const [{ data: laptops, error: lapErr }, { data: specsData }, { data: pricesData }] =
    await Promise.all([
      supabase.from('laptops').select('id, slug, brand, model, year').in('id', ids).returns<LaptopRow[]>(),
      supabase
        .from('specs')
        .select(
          'laptop_id, cpu, cpu_cores, ram_gb, storage_gb, storage_type, gpu, gpu_vram_gb, screen_inches, screen_resolution, screen_refresh_hz, weight_kg, battery_wh, ports, os',
        )
        .in('laptop_id', ids)
        .returns<SpecRow[]>(),
      supabase
        .from('prices_history')
        .select('laptop_id, price_eur')
        .in('laptop_id', ids)
        .returns<PriceRow[]>(),
    ]);

  if (lapErr) {
    return (
      <main className="mx-auto max-w-4xl p-8">
        <BackHome />
        <ErrorBox title="Error consultando Supabase" message={lapErr.message} />
      </main>
    );
  }

  // Preservar el orden de los ids tal como vinieron en la URL.
  const laptopById = new Map((laptops ?? []).map((l) => [l.id, l] as const));
  const ordered = ids.map((id) => laptopById.get(id)).filter((l): l is LaptopRow => Boolean(l));

  const specsByLaptop = new Map<string, SpecRow>();
  for (const s of specsData ?? []) specsByLaptop.set(s.laptop_id, s);

  const minPriceByLaptop = new Map<string, number>();
  for (const p of pricesData ?? []) {
    const cur = minPriceByLaptop.get(p.laptop_id);
    if (cur === undefined || p.price_eur < cur) {
      minPriceByLaptop.set(p.laptop_id, p.price_eur);
    }
  }

  const rows = buildRows(ordered, specsByLaptop, minPriceByLaptop);

  return (
    <main className="mx-auto max-w-6xl p-8">
      <BackHome />
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Comparativa</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {ordered.length} portátiles · diferencias resaltadas en azul.
        </p>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <th className="w-40 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                Atributo
              </th>
              {ordered.map((l) => (
                <th key={l.id} className="px-3 py-3 text-left">
                  <p className="text-xs text-zinc-500">{l.brand}</p>
                  <p className="font-medium leading-tight">{l.model}</p>
                  {l.year && <p className="text-xs text-zinc-500">{l.year}</p>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const distinct = new Set(row.values.map((v) => normalize(v))).size > 1;
              return (
                <tr
                  key={row.label}
                  className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"
                >
                  <th className="py-2 pr-3 text-left text-xs font-medium text-zinc-500">
                    {row.label}
                  </th>
                  {row.values.map((value, i) => (
                    <td
                      key={i}
                      className={
                        'px-3 py-2 align-top ' +
                        (distinct ? 'text-blue-700 dark:text-blue-300' : 'text-zinc-800 dark:text-zinc-200')
                      }
                    >
                      {value === null || value === undefined || value === '' ? (
                        <span className="text-zinc-400">—</span>
                      ) : Array.isArray(value) ? (
                        <ul className="space-y-0.5">
                          {value.map((v, j) => (
                            <li key={j}>{v}</li>
                          ))}
                        </ul>
                      ) : (
                        String(value)
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}

type Row = { label: string; values: Array<string | number | string[] | null> };

function buildRows(
  laptops: LaptopRow[],
  specs: Map<string, SpecRow>,
  prices: Map<string, number>,
): Row[] {
  const get = <K extends keyof SpecRow>(id: string, key: K): SpecRow[K] | null =>
    specs.get(id)?.[key] ?? null;

  return [
    {
      label: 'Precio desde',
      values: laptops.map((l) => {
        const p = prices.get(l.id);
        return p === undefined ? null : formatEur(p);
      }),
    },
    { label: 'CPU', values: laptops.map((l) => get(l.id, 'cpu')) },
    {
      label: 'Núcleos',
      values: laptops.map((l) => {
        const v = get(l.id, 'cpu_cores');
        return v === null ? null : `${v}`;
      }),
    },
    {
      label: 'RAM',
      values: laptops.map((l) => {
        const v = get(l.id, 'ram_gb');
        return v === null ? null : `${v} GB`;
      }),
    },
    {
      label: 'Almacenamiento',
      values: laptops.map((l) => {
        const gb = get(l.id, 'storage_gb');
        const type = get(l.id, 'storage_type');
        if (gb === null) return null;
        return type ? `${gb} GB ${type}` : `${gb} GB`;
      }),
    },
    {
      label: 'GPU',
      values: laptops.map((l) => {
        const gpu = get(l.id, 'gpu');
        const vram = get(l.id, 'gpu_vram_gb');
        if (!gpu) return null;
        return vram ? `${gpu} (${vram} GB)` : gpu;
      }),
    },
    {
      label: 'Pantalla',
      values: laptops.map((l) => {
        const size = get(l.id, 'screen_inches');
        const res = get(l.id, 'screen_resolution');
        const hz = get(l.id, 'screen_refresh_hz');
        if (size === null) return null;
        const parts = [`${size}″`];
        if (res) parts.push(res);
        if (hz) parts.push(`${hz} Hz`);
        return parts.join(' · ');
      }),
    },
    {
      label: 'Peso',
      values: laptops.map((l) => {
        const v = get(l.id, 'weight_kg');
        return v === null ? null : `${v} kg`;
      }),
    },
    {
      label: 'Batería',
      values: laptops.map((l) => {
        const v = get(l.id, 'battery_wh');
        return v === null ? null : `${v} Wh`;
      }),
    },
    { label: 'Puertos', values: laptops.map((l) => get(l.id, 'ports')) },
    { label: 'SO', values: laptops.map((l) => get(l.id, 'os')) },
  ];
}

function normalize(v: string | number | string[] | null | undefined): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.join('|');
  return String(v);
}

function formatEur(value: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}

function BackHome() {
  return (
    <p className="mb-6">
      <Link
        href="/"
        className="text-sm text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        ← Volver
      </Link>
    </p>
  );
}

function ErrorBox({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
      <h2 className="font-medium">{title}</h2>
      <pre className="mt-2 whitespace-pre-wrap text-xs">{message}</pre>
    </div>
  );
}
