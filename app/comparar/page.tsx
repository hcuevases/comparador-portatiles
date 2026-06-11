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
  | 'screen_brightness_nits'
  | 'screen_touch'
  | 'screen_color_gamut'
  | 'screen_hdr'
  | 'screen_response_ms'
  | 'weight_kg'
  | 'battery_wh'
  | 'ports'
  | 'os'
  | 'usage_type'
  | 'product_line'
  | 'cpu_key'
  | 'gpu_key'
>;
type CpuBench = Pick<Tables<'cpu_benchmarks'>, 'component_key' | 'score' | 'geekbench_multi'>;
type GpuBench = Pick<Tables<'gpu_benchmarks'>, 'component_key' | 'score' | 'g3dmark'>;
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
        'laptop_id, cpu, cpu_cores, ram_gb, storage_gb, storage_type, gpu, gpu_vram_gb, screen_inches, screen_resolution, screen_refresh_hz, screen_panel_type, screen_brightness_nits, screen_touch, screen_color_gamut, screen_hdr, screen_response_ms, weight_kg, battery_wh, ports, os, usage_type, product_line, cpu_key, gpu_key',
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

  // Benchmarks por componente (nanoreview), join por specs.cpu_key/gpu_key.
  const cpuKeys = [
    ...new Set((specsData ?? []).map((s) => s.cpu_key).filter((k): k is string => Boolean(k))),
  ];
  const gpuKeys = [
    ...new Set((specsData ?? []).map((s) => s.gpu_key).filter((k): k is string => Boolean(k))),
  ];
  const [{ data: cpuB }, { data: gpuB }] = await Promise.all([
    cpuKeys.length
      ? supabase
          .from('cpu_benchmarks')
          .select('component_key, score, geekbench_multi')
          .in('component_key', cpuKeys)
          .eq('status', 'ok')
          .returns<CpuBench[]>()
      : Promise.resolve({ data: [] as CpuBench[] }),
    gpuKeys.length
      ? supabase
          .from('gpu_benchmarks')
          .select('component_key, score, g3dmark')
          .in('component_key', gpuKeys)
          .eq('status', 'ok')
          .returns<GpuBench[]>()
      : Promise.resolve({ data: [] as GpuBench[] }),
  ]);
  const cpuByKey = new Map((cpuB ?? []).map((b) => [b.component_key, b] as const));
  const gpuByKey = new Map((gpuB ?? []).map((b) => [b.component_key, b] as const));

  // Solo filas con al menos un valor: sin datos en ningún portátil, la fila no
  // aporta y añade ruido a la tabla.
  const rows = buildRows(ordered, specsByLaptop, minPriceByLaptop, cpuByKey, gpuByKey).filter(
    (row) => row.cells.some((c) => !isEmpty(c.value)),
  );

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-8">
      <BackHome />
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Comparativa</h1>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
            {ordered.length} portátiles ·
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-cyan-500/80" />
              mejor valor resaltado
            </span>
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
                className="mt-1 block w-64 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 dark:border-zinc-700 dark:bg-zinc-900"
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

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <th className="sticky left-0 z-10 w-40 border-r border-zinc-200 bg-white px-4 py-3 text-left align-bottom text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
                Atributo
              </th>
              {ordered.map((l) => (
                <th key={l.id} className="min-w-40 border-l border-zinc-100 px-3 py-4 text-left align-bottom dark:border-zinc-900">
                  <Link href={`/portatiles/${l.slug}`} className="group block">
                    <div className="relative mb-2.5 flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-zinc-100 bg-[radial-gradient(120%_120%_at_50%_0%,var(--color-zinc-100),var(--color-white))] dark:border-zinc-800 dark:bg-[radial-gradient(120%_120%_at_50%_0%,var(--color-zinc-800),var(--color-zinc-950))]">
                      {l.image_url ? (
                        <Image
                          src={pccThumb(l.image_url, 300)}
                          alt={`${l.brand} ${l.model}`}
                          fill
                          sizes="80px"
                          className="object-contain p-2 transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <span className="text-[10px] text-zinc-400">Sin imagen</span>
                      )}
                    </div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-400">
                      {l.brand}
                    </p>
                    <p className="font-display font-bold leading-tight transition-colors group-hover:text-cyan-700 dark:group-hover:text-cyan-300">
                      {l.model}
                    </p>
                    {l.year && <p className="mt-0.5 text-xs text-zinc-500">{l.year}</p>}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const winners = winnersOf(row);
              const isPrice = row.label === 'Precio desde';
              return (
                <tr
                  key={row.label}
                  className="border-b border-zinc-100 last:border-0 odd:bg-zinc-50/60 dark:border-zinc-900 dark:odd:bg-zinc-900/40"
                >
                  <th className="sticky left-0 z-10 border-r border-zinc-200 bg-white px-4 py-2.5 text-left text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
                    {row.label}
                  </th>
                  {row.cells.map((cell, i) => {
                    const won = winners.has(i);
                    return (
                      <td
                        key={i}
                        className={
                          'border-l border-zinc-100 px-3 py-2.5 align-top dark:border-zinc-900 ' +
                          (won
                            ? 'bg-cyan-50 font-semibold text-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-200'
                            : 'text-zinc-800 dark:text-zinc-200') +
                          (isPrice ? ' text-base font-semibold' : '')
                        }
                      >
                        {isEmpty(cell.value) ? (
                          <span className="text-zinc-400">—</span>
                        ) : Array.isArray(cell.value) ? (
                          <ul className="space-y-0.5">
                            {cell.value.map((v, j) => (
                              <li key={j}>{v}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            {String(cell.value)}
                            {won && (
                              <span className="rounded-full bg-cyan-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-white">
                                mejor
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}

type CellValue = string | string[] | null;
// `rank`: número comparable para decidir el "mejor" de la fila. `better` indica
// si gana el mayor o el menor. Las filas de texto puro llevan rank null/better
// null y no resaltan ganador.
type Cell = { value: CellValue; rank: number | null };
type Row = { label: string; cells: Cell[]; better: 'higher' | 'lower' | null };

function buildRows(
  laptops: LaptopRow[],
  specs: Map<string, SpecRow>,
  prices: Map<string, number>,
  cpuByKey: Map<string, CpuBench>,
  gpuByKey: Map<string, GpuBench>,
): Row[] {
  const get = <K extends keyof SpecRow>(id: string, key: K): SpecRow[K] | null =>
    specs.get(id)?.[key] ?? null;

  const cpuBench = <K extends keyof CpuBench>(id: string, field: K): number | null => {
    const key = specs.get(id)?.cpu_key;
    const v = key ? cpuByKey.get(key)?.[field] : null;
    return typeof v === 'number' ? v : null;
  };
  const gpuBench = <K extends keyof GpuBench>(id: string, field: K): number | null => {
    const key = specs.get(id)?.gpu_key;
    const v = key ? gpuByKey.get(key)?.[field] : null;
    return typeof v === 'number' ? v : null;
  };

  // Fila de texto: sin ranking.
  const text = (label: string, fn: (id: string) => CellValue): Row => ({
    label,
    better: null,
    cells: laptops.map((l) => ({ value: fn(l.id), rank: null })),
  });

  // Fila numérica: display + valor comparable + dirección del "mejor".
  const num = (
    label: string,
    better: 'higher' | 'lower',
    fn: (id: string) => { value: CellValue; rank: number | null },
  ): Row => ({ label, better, cells: laptops.map((l) => fn(l.id)) });

  return [
    num('Precio desde', 'lower', (id) => {
      const p = prices.get(id);
      return { value: p === undefined ? null : formatEur(p), rank: p ?? null };
    }),
    text('CPU', (id) => get(id, 'cpu')),
    num('Núcleos', 'higher', (id) => {
      const v = get(id, 'cpu_cores');
      return { value: v === null ? null : `${v}`, rank: v };
    }),
    num('Puntuación CPU', 'higher', (id) => {
      const v = cpuBench(id, 'score');
      return { value: v === null ? null : `${v}`, rank: v };
    }),
    num('Geekbench (multi)', 'higher', (id) => {
      const v = cpuBench(id, 'geekbench_multi');
      return { value: v === null ? null : v.toLocaleString('es-ES'), rank: v };
    }),
    num('RAM', 'higher', (id) => {
      const v = get(id, 'ram_gb');
      return { value: v === null ? null : `${v} GB`, rank: v };
    }),
    num('Almacenamiento', 'higher', (id) => {
      const gb = get(id, 'storage_gb');
      const type = get(id, 'storage_type');
      if (gb === null) return { value: null, rank: null };
      return { value: type ? `${gb} GB ${type}` : `${gb} GB`, rank: gb };
    }),
    text('GPU', (id) => {
      const gpu = get(id, 'gpu');
      const vram = get(id, 'gpu_vram_gb');
      if (!gpu) return null;
      return vram ? `${gpu} (${vram} GB)` : gpu;
    }),
    num('Puntuación GPU', 'higher', (id) => {
      const v = gpuBench(id, 'score');
      return { value: v === null ? null : `${v}`, rank: v };
    }),
    num('3DMark', 'higher', (id) => {
      const v = gpuBench(id, 'g3dmark');
      return { value: v === null ? null : v.toLocaleString('es-ES'), rank: v };
    }),
    text('Pantalla', (id) => {
      const size = get(id, 'screen_inches');
      const res = get(id, 'screen_resolution');
      const hz = get(id, 'screen_refresh_hz');
      if (size === null) return null;
      const parts = [`${size}″`];
      if (res) parts.push(res);
      if (hz) parts.push(`${hz} Hz`);
      return parts.join(' · ');
    }),
    text('Tipo de panel', (id) => get(id, 'screen_panel_type')),
    num('Brillo', 'higher', (id) => {
      const v = get(id, 'screen_brightness_nits');
      return { value: v === null ? null : `${v} nits`, rank: v };
    }),
    text('Gama de color', (id) => get(id, 'screen_color_gamut')),
    text('HDR', (id) => get(id, 'screen_hdr')),
    text('Táctil', (id) => (get(id, 'screen_touch') === true ? 'Sí' : null)),
    num('Tiempo de respuesta', 'lower', (id) => {
      const v = get(id, 'screen_response_ms');
      return { value: v === null ? null : `${v} ms`, rank: v };
    }),
    num('Peso', 'lower', (id) => {
      const v = get(id, 'weight_kg');
      return { value: v === null ? null : `${v} kg`, rank: v };
    }),
    num('Batería', 'higher', (id) => {
      const v = get(id, 'battery_wh');
      return { value: v === null ? null : `${v} Wh`, rank: v };
    }),
    text('Puertos', (id) => get(id, 'ports')),
    text('SO', (id) => get(id, 'os')),
    text('Tipo de uso', (id) => get(id, 'usage_type')),
    text('Gama', (id) => get(id, 'product_line')),
  ];
}

// Índices de las celdas ganadoras de una fila. Solo hay ganador si la fila es
// rankeable, tiene ≥2 valores y existe diferencia real (si todas empatan, no se
// resalta nada). Los empates en el mejor valor se marcan todos.
function winnersOf(row: Row): Set<number> {
  if (row.better === null) return new Set();
  const ranked = row.cells
    .map((c, i) => ({ rank: c.rank, i }))
    .filter((c): c is { rank: number; i: number } => c.rank !== null);
  if (ranked.length < 2) return new Set();
  const ranks = ranked.map((c) => c.rank);
  if (new Set(ranks).size === 1) return new Set();
  const best = row.better === 'higher' ? Math.max(...ranks) : Math.min(...ranks);
  return new Set(ranked.filter((c) => c.rank === best).map((c) => c.i));
}

function isEmpty(value: CellValue): boolean {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  return false;
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
