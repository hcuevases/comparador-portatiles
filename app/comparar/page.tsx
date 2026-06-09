import Image from 'next/image';
import Link from 'next/link';

import { SubmitButton } from '@/components/submit-button';
import { pccThumb } from '@/lib/images';
import type { Tables } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/server';

import { saveComparison } from './actions';

// Derivados del esquema generado. Cambia una columna en Supabase y aquí salta TS.
type LaptopRow = Pick<Tables<'laptops'>, 'id' | 'slug' | 'brand' | 'model' | 'year' | 'image_url'>;
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
  | 'screen_panel_type'
  | 'weight_kg'
  | 'battery_wh'
  | 'ports'
  | 'os'
  | 'usage_type'
  | 'product_line'
>;
const MAX_COMPARE = 4;

type CompararSearchParams = { ids?: string; error?: string; message?: string };

export default async function CompararPage({
  searchParams,
}: {
  searchParams: Promise<CompararSearchParams>;
}) {
  const { ids: idsParam, error: errorParam, message: messageParam } = await searchParams;

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

  const [
    {
      data: { user },
    },
    { data: laptops, error: lapErr },
    { data: specsData },
    { data: pricesData },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('laptops')
      .select('id, slug, brand, model, year, image_url')
      .in('id', ids)
      .returns<LaptopRow[]>(),
    supabase
      .from('specs')
      .select(
        'laptop_id, cpu, cpu_cores, ram_gb, storage_gb, storage_type, gpu, gpu_vram_gb, screen_inches, screen_resolution, screen_refresh_hz, screen_panel_type, weight_kg, battery_wh, ports, os, usage_type, product_line',
      )
      .in('laptop_id', ids)
      .returns<SpecRow[]>(),
    // Precio actual (último por retailer → mínimo entre retailers) vía la RPC
    // current_min_prices: única fuente de la definición (antes se replicaba aquí en
    // TS trayendo todo prices_history). Ver db/migrations/0015_current_min_prices.sql.
    supabase.rpc('current_min_prices', { p_ids: ids }),
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

  // Precio actual por portátil: lo da la RPC (último por retailer → min entre
  // retailers). min_price puede ser null si el portátil no tiene precios.
  const minPriceByLaptop = new Map<string, number>();
  for (const r of pricesData ?? []) {
    if (r.min_price !== null) minPriceByLaptop.set(r.laptop_id, Number(r.min_price));
  }

  const rows = buildRows(ordered, specsByLaptop, minPriceByLaptop);

  return (
    <main className="mx-auto max-w-6xl p-8">
      <BackHome />
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Comparativa</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {ordered.length} portátiles · diferencias resaltadas en azul.
          </p>
        </div>

        {user ? (
          <form action={saveComparison} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="ids" value={ordered.map((l) => l.id).join(',')} />
            <div>
              <label htmlFor="comparison-name" className="block text-xs text-zinc-500">
                Nombre (opcional)
              </label>
              <input
                id="comparison-name"
                name="name"
                type="text"
                maxLength={100}
                placeholder="ej: ultrabooks 14 pulgadas"
                className="mt-1 block w-64 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
            <SubmitButton pendingText="Guardando…">Guardar comparativa</SubmitButton>
          </form>
        ) : (
          <p className="text-xs text-zinc-500">
            <Link href="/login" className="underline hover:text-zinc-900 dark:hover:text-zinc-100">
              Inicia sesión
            </Link>{' '}
            para guardar esta comparativa.
          </p>
        )}
      </header>

      {messageParam && (
        <div className="mb-4 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-100">
          {messageParam}
        </div>
      )}
      {errorParam && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
          {errorParam}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <th className="sticky left-0 z-10 w-40 border-r border-zinc-200 bg-white py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
                Atributo
              </th>
              {ordered.map((l) => (
                <th key={l.id} className="min-w-36 px-3 py-3 text-left align-bottom">
                  <Link
                    href={`/portatiles/${l.slug}`}
                    className="block hover:opacity-80"
                  >
                    {l.image_url && (
                      <div className="relative mb-2 h-16 w-16 overflow-hidden rounded bg-zinc-50 dark:bg-zinc-900">
                        <Image
                          src={pccThumb(l.image_url, 300)}
                          alt={`${l.brand} ${l.model}`}
                          fill
                          sizes="64px"
                          className="object-contain p-1"
                        />
                      </div>
                    )}
                    <p className="text-xs text-zinc-500">{l.brand}</p>
                    <p className="font-medium leading-tight">{l.model}</p>
                    {l.year && <p className="text-xs text-zinc-500">{l.year}</p>}
                  </Link>
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
                  <th className="sticky left-0 z-10 border-r border-zinc-200 bg-white py-2 pr-3 text-left text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
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
    { label: 'Tipo de panel', values: laptops.map((l) => get(l.id, 'screen_panel_type')) },
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
    { label: 'Tipo de uso', values: laptops.map((l) => get(l.id, 'usage_type')) },
    { label: 'Gama', values: laptops.map((l) => get(l.id, 'product_line')) },
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
