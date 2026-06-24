import { Laptop } from 'lucide-react';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { AddToCompareButton } from '@/components/add-to-compare-button';
import { BackToCatalog, BackToCatalogFallback } from '@/components/back-to-catalog';
import { ImageWithFallback } from '@/components/image-with-fallback';
import { PriceAlertButton } from '@/components/price-alert-button';
import {
  PriceHistoryChart,
  type ChartDatum,
  type ChartSeries,
} from '@/components/price-history-chart';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Tables } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/server';

// Pre-render todas las páginas al build; revalidación cada hora para recoger
// nuevos precios del cron (cuando exista).
export const revalidate = 3600;
export const dynamicParams = true;

const HISTORY_DAYS = 90;

const SERIES_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#ea580c', '#9333ea', '#0891b2'];

type RouteParams = { slug: string };

// Derivados del esquema generado. Si una columna cambia, TS revienta.
type Laptop = Pick<
  Tables<'laptops'>,
  'id' | 'slug' | 'brand' | 'model' | 'year' | 'description' | 'image_url'
>;
type Specs = Pick<
  Tables<'specs'>,
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
  | 'keyboard_lang'
  | 'ai_optimized'
  | 'product_line'
  | 'cpu_key'
  | 'gpu_key'
  | 'screen_brightness_nits'
  | 'screen_touch'
  | 'screen_color_gamut'
  | 'screen_hdr'
  | 'screen_response_ms'
>;
type CpuBench = Pick<
  Tables<'cpu_benchmarks'>,
  'name' | 'score' | 'geekbench_single' | 'geekbench_multi' | 'cores' | 'threads' | 'tdp_w' | 'release_year'
>;
type GpuBench = Pick<
  Tables<'gpu_benchmarks'>,
  'name' | 'score' | 'g3dmark' | 'vram_gb' | 'tdp_w'
>;
type Retailer = Pick<Tables<'retailers'>, 'id' | 'slug' | 'name'>;
type AffiliateLink = Pick<Tables<'affiliate_links'>, 'id' | 'retailer_id' | 'url'>;
type PriceRow = Pick<Tables<'prices_history'>, 'retailer_id' | 'price_eur' | 'observed_at'>;

// generateStaticParams corre en build time, sin request HTTP. El cliente
// server-side normal depende de cookies(), que no existen en ese contexto.
// Usamos el cliente admin (service role) porque es server-only y no toca
// cookies. Solo leemos slugs públicos, así que no exponemos nada sensible.
export async function generateStaticParams(): Promise<RouteParams[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('laptops')
    .select('slug')
    .returns<{ slug: string }[]>();
  return (data ?? []).map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<{ title: string; description?: string }> {
  const { slug } = await params;
  // Mismo motivo que generateStaticParams: en build no hay cookies.
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('laptops')
    .select('brand, model, year, description')
    .eq('slug', slug)
    .maybeSingle<Pick<Laptop, 'brand' | 'model' | 'year' | 'description'>>();

  if (!data) return { title: 'Portátil no encontrado' };

  const yearTag = data.year ? ` (${data.year})` : '';
  return {
    title: `${data.brand} ${data.model}${yearTag} — comparador`,
    description:
      data.description ??
      `Especificaciones, precios actuales y evolución histórica de ${data.brand} ${data.model}.`,
  };
}

export default async function LaptopDetailPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: laptop } = await supabase
    .from('laptops')
    .select('id, slug, brand, model, year, description, image_url')
    .eq('slug', slug)
    .maybeSingle<Laptop>();

  if (!laptop) notFound();

  const sinceISO = historyStartISO();

  const [{ data: specs }, { data: retailers }, { data: links }, { data: history }] =
    await Promise.all([
      supabase
        .from('specs')
        .select(
          'cpu, cpu_cores, ram_gb, storage_gb, storage_type, gpu, gpu_vram_gb, screen_inches, screen_resolution, screen_refresh_hz, screen_panel_type, weight_kg, battery_wh, ports, os, usage_type, keyboard_lang, ai_optimized, product_line, cpu_key, gpu_key, screen_brightness_nits, screen_touch, screen_color_gamut, screen_hdr, screen_response_ms',
        )
        .eq('laptop_id', laptop.id)
        .maybeSingle<Specs>(),
      supabase
        .from('retailers')
        .select('id, slug, name')
        .eq('active', true)
        .returns<Retailer[]>(),
      supabase
        .from('affiliate_links')
        .select('id, retailer_id, url')
        .eq('laptop_id', laptop.id)
        .eq('active', true)
        .returns<AffiliateLink[]>(),
      supabase
        .from('prices_history')
        .select('retailer_id, price_eur, observed_at')
        .eq('laptop_id', laptop.id)
        .gte('observed_at', sinceISO)
        .order('observed_at', { ascending: true })
        .returns<PriceRow[]>(),
    ]);

  // Benchmarks por componente (join por la clave normalizada). Solo si specs trae
  // clave y el componente tiene datos: scrapeado (status='ok') o manual (status='manual',
  // p.ej. Apple M-Pro/Max, ausentes de nanoreview).
  const [{ data: cpuBench }, { data: gpuBench }] = await Promise.all([
    specs?.cpu_key
      ? supabase
          .from('cpu_benchmarks')
          .select('name, score, geekbench_single, geekbench_multi, cores, threads, tdp_w, release_year')
          .eq('component_key', specs.cpu_key)
          .in('status', ['ok', 'manual'])
          .maybeSingle<CpuBench>()
      : Promise.resolve({ data: null }),
    specs?.gpu_key
      ? supabase
          .from('gpu_benchmarks')
          .select('name, score, g3dmark, vram_gb, tdp_w')
          .eq('component_key', specs.gpu_key)
          .in('status', ['ok', 'manual'])
          .maybeSingle<GpuBench>()
      : Promise.resolve({ data: null }),
  ]);

  const retailerById = new Map<string, Retailer>();
  for (const r of retailers ?? []) retailerById.set(r.id, r);

  // Precio actual (último observado) por retailer.
  const latestByRetailer = new Map<string, { price_eur: number; observed_at: string }>();
  for (const row of history ?? []) {
    latestByRetailer.set(row.retailer_id, {
      price_eur: Number(row.price_eur),
      observed_at: row.observed_at,
    });
  }

  // Construcción de series para el chart.
  // Estructura final: data = [{ date: '2026-02-20', label: '20 feb', 'Amazon España': 1299, 'PcComponentes': 1349 }, ...]
  // - Agrupamos por día (UTC). Si hay >1 obs/retailer/día, gana la más reciente
  //   (history viene ordenado asc, así que la última sobrescribe).
  // - `date` se mantiene para ordenar; `label` es el que se pinta en el eje X.
  const byDay = new Map<string, ChartDatum>();
  for (const row of history ?? []) {
    const retailer = retailerById.get(row.retailer_id);
    if (!retailer) continue;
    const dateKey = row.observed_at.slice(0, 10); // YYYY-MM-DD
    const bucket =
      byDay.get(dateKey) ?? { date: dateKey, label: formatDayShort(dateKey) };
    bucket[retailer.name] = Number(row.price_eur);
    byDay.set(dateKey, bucket);
  }

  const chartData = Array.from(byDay.values()).sort((a, b) =>
    a.date < b.date ? -1 : 1,
  );

  // Retailers con datos en el período → colores asignados.
  const retailersInChart = Array.from(
    new Set(
      (history ?? [])
        .map((r) => retailerById.get(r.retailer_id)?.name)
        .filter((n): n is string => Boolean(n)),
    ),
  );
  const series: ChartSeries[] = retailersInChart.map((name, i) => ({
    name,
    color: SERIES_COLORS[i % SERIES_COLORS.length],
  }));

  // Tarjetas de retailers: combinamos affiliate_links con el precio actual.
  const linksByRetailer = new Map<string, AffiliateLink>();
  for (const link of links ?? []) linksByRetailer.set(link.retailer_id, link);

  // Solo mostramos retailers con precio reciente. Un retailer con affiliate
  // link pero sin precio reciente no es útil al usuario — no sabe a qué precio
  // está comprando. Cuando el cron de ingesta esté en marcha, el invariante es
  // "si hay link debería haber precio"; si no se cumple, el retailer queda
  // oculto hasta que el siguiente run lo arregle.
  const retailerCards = (retailers ?? [])
    .map((r) => {
      const link = linksByRetailer.get(r.id);
      const latest = latestByRetailer.get(r.id);
      return { retailer: r, link, latest };
    })
    .filter(
      (c): c is { retailer: Retailer; link: AffiliateLink | undefined; latest: { price_eur: number; observed_at: string } } =>
        c.latest !== undefined,
    )
    .sort((a, b) => a.latest.price_eur - b.latest.price_eur);

  const minPrice = retailerCards.reduce<number | null>((acc, c) => {
    if (c.latest === undefined) return acc;
    if (acc === null || c.latest.price_eur < acc) return c.latest.price_eur;
    return acc;
  }, null);

  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-8">
      <nav className="mb-6 text-sm">
        <Suspense fallback={<BackToCatalogFallback />}>
          <BackToCatalog />
        </Suspense>
      </nav>

      <header className="mb-10 grid gap-6 sm:grid-cols-[auto_1fr] sm:items-start sm:gap-8">
        {laptop.image_url && (
          <div className="relative h-60 w-60 shrink-0 overflow-hidden rounded-2xl border border-zinc-200 bg-[radial-gradient(120%_120%_at_50%_0%,var(--color-zinc-100),var(--color-white))] shadow-md shadow-zinc-900/5 dark:border-zinc-800 dark:bg-[radial-gradient(120%_120%_at_50%_0%,var(--color-zinc-800),var(--color-zinc-950))]">
            <ImageWithFallback
              src={laptop.image_url}
              alt={`${laptop.brand} ${laptop.model}`}
              fill
              sizes="240px"
              className="object-contain p-6 drop-shadow-lg"
              priority
              fallback={
                <div className="flex h-full items-center justify-center">
                  <Laptop className="h-20 w-20 text-zinc-300 dark:text-zinc-700" aria-hidden />
                </div>
              }
            />
          </div>
        )}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-400">
            {laptop.brand}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{laptop.model}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {laptop.year && (
              <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                {laptop.year}
              </span>
            )}
            {laptop.slug.endsWith('-refurbished') && (
              <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                Reacondicionado
              </span>
            )}
          </div>
          {laptop.description && (
            <p className="mt-4 max-w-2xl text-zinc-700 dark:text-zinc-300">
              {laptop.description}
            </p>
          )}
          {minPrice !== null && (
            <div className="mt-5 flex items-baseline gap-2">
              <span className="text-sm text-zinc-500">Desde</span>
              <span className="font-display text-3xl font-extrabold tracking-tight">
                {formatEur(minPrice)}
              </span>
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-start gap-3">
            <AddToCompareButton
              laptop={{
                id: laptop.id,
                brand: laptop.brand,
                model: laptop.model,
                image_url: laptop.image_url,
              }}
            />
            <PriceAlertButton laptopId={laptop.id} />
          </div>
        </div>
      </header>

      {retailerCards.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-xl font-bold tracking-tight">Disponible en</h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {retailerCards.map(({ retailer, link, latest }) => {
              const isCheapest = minPrice !== null && latest.price_eur === minPrice;
              return (
              <li
                key={retailer.id}
                className={
                  'flex items-center justify-between gap-3 rounded-xl border bg-white p-4 transition-all hover:shadow-md dark:bg-zinc-950 ' +
                  (isCheapest
                    ? 'border-cyan-500 shadow-sm shadow-cyan-500/20 ring-1 ring-cyan-500/30'
                    : 'border-zinc-200 shadow-sm dark:border-zinc-800')
                }
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{retailer.name}</p>
                    {isCheapest && (
                      <span className="shrink-0 rounded-full bg-cyan-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                        Mejor precio
                      </span>
                    )}
                  </div>
                  <p className="mt-1 flex items-baseline gap-2">
                    <span className="font-display text-xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">
                      {formatEur(latest.price_eur)}
                    </span>
                    <span className="text-xs text-zinc-400">
                      · {formatDayShort(latest.observed_at.slice(0, 10))}
                    </span>
                  </p>
                </div>
                {link ? (
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer sponsored"
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-cyan-700"
                  >
                    Ver oferta <span aria-hidden>→</span>
                  </a>
                ) : (
                  <span className="shrink-0 text-xs text-zinc-400">Sin enlace afiliado</span>
                )}
              </li>
              );
            })}
          </ul>
        </section>
      )}

      {chartData.length > 0 && series.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-xl font-bold tracking-tight">Histórico de precios (90 días)</h2>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <PriceHistoryChart data={chartData} series={series} />
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Los precios mostrados son orientativos y se actualizan periódicamente. Comprueba el
            precio final en la web del retailer antes de comprar.
          </p>
        </section>
      )}

      <PerformanceSection cpu={cpuBench} gpu={gpuBench} />

      {specs && <SpecsSection specs={specs} />}
    </main>
  );
}

// Benchmarks de CPU/GPU (nanoreview). Solo se renderiza si hay al menos uno.
function PerformanceSection({ cpu, gpu }: { cpu: CpuBench | null; gpu: GpuBench | null }) {
  if (!cpu && !gpu) return null;
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-xl font-bold tracking-tight">Rendimiento</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {cpu && (
          <BenchCard
            title="CPU"
            name={cpu.name}
            score={cpu.score}
            rows={[
              { label: 'Geekbench (single)', value: cpu.geekbench_single },
              { label: 'Geekbench (multi)', value: cpu.geekbench_multi },
              { label: 'Núcleos / hilos', value: fmtCoresThreads(cpu.cores, cpu.threads) },
              { label: 'TDP', value: cpu.tdp_w ? `${cpu.tdp_w} W` : null },
              { label: 'Año', value: cpu.release_year },
            ]}
          />
        )}
        {gpu && (
          <BenchCard
            title="GPU"
            name={gpu.name}
            score={gpu.score}
            rows={[
              { label: '3DMark', value: gpu.g3dmark },
              { label: 'VRAM', value: gpu.vram_gb ? `${gpu.vram_gb} GB` : null },
              { label: 'TDP', value: gpu.tdp_w ? `${gpu.tdp_w} W` : null },
            ]}
          />
        )}
      </div>
      <p className="mt-2 text-xs text-zinc-500">Datos de rendimiento de nanoreview.net.</p>
    </section>
  );
}

function BenchCard({
  title,
  name,
  score,
  rows,
}: {
  title: string;
  name: string | null;
  score: number | null;
  rows: { label: string; value: string | number | null }[];
}) {
  const visible = rows.filter((r) => r.value !== null && r.value !== undefined);
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-400">
            {title}
          </p>
          {name && <p className="truncate font-medium">{name}</p>}
        </div>
        {score !== null && (
          <div className="shrink-0 text-right">
            <span className="font-display text-2xl font-extrabold tracking-tight">{score}</span>
            <span className="text-xs text-zinc-400">/100</span>
          </div>
        )}
      </div>
      {visible.length > 0 && (
        <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5">
          {visible.map((r) => (
            <div key={r.label} className="contents">
              <dt className="text-sm text-zinc-500 dark:text-zinc-400">{r.label}</dt>
              <dd className="text-sm text-zinc-900 dark:text-zinc-100">{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function fmtCoresThreads(cores: number | null, threads: number | null): string | null {
  if (cores === null && threads === null) return null;
  if (cores !== null && threads !== null) return `${cores} / ${threads}`;
  return `${cores ?? threads}`;
}

// Specs agrupadas por bloque temático para que la ficha se lea de un vistazo en
// vez de como un listado plano de 16 filas. Los grupos sin ningún valor (y las
// filas null dentro de cada grupo) no se renderizan.
function SpecsSection({ specs }: { specs: Specs }) {
  const groups: { title: string; rows: { label: string; value: string | null }[] }[] = [
    {
      title: 'Rendimiento',
      rows: [
        { label: 'CPU', value: specs.cpu },
        { label: 'Núcleos', value: specs.cpu_cores ? `${specs.cpu_cores} núcleos` : null },
        { label: 'RAM', value: specs.ram_gb ? `${specs.ram_gb} GB` : null },
        {
          label: 'Almacenamiento',
          value: specs.storage_gb
            ? `${specs.storage_gb} GB${specs.storage_type ? ` (${specs.storage_type})` : ''}`
            : null,
        },
        { label: 'GPU', value: specs.gpu },
        { label: 'VRAM', value: specs.gpu_vram_gb ? `${specs.gpu_vram_gb} GB` : null },
      ],
    },
    {
      title: 'Pantalla',
      rows: [
        {
          label: 'Pantalla',
          value: specs.screen_inches
            ? `${specs.screen_inches}″${specs.screen_resolution ? ` · ${specs.screen_resolution}` : ''}${specs.screen_refresh_hz ? ` · ${specs.screen_refresh_hz} Hz` : ''}`
            : null,
        },
        { label: 'Tipo de panel', value: specs.screen_panel_type },
        {
          label: 'Brillo',
          value: specs.screen_brightness_nits ? `${specs.screen_brightness_nits} nits` : null,
        },
        { label: 'Táctil', value: specs.screen_touch === true ? 'Sí' : null },
        { label: 'Gama de color', value: specs.screen_color_gamut },
        { label: 'HDR', value: specs.screen_hdr },
        {
          label: 'Tiempo de respuesta',
          value: specs.screen_response_ms ? `${specs.screen_response_ms} ms` : null,
        },
      ],
    },
    {
      title: 'Diseño y batería',
      rows: [
        { label: 'Peso', value: specs.weight_kg ? `${specs.weight_kg} kg` : null },
        { label: 'Batería', value: specs.battery_wh ? `${specs.battery_wh} Wh` : null },
      ],
    },
    {
      title: 'Conectividad',
      rows: [
        {
          label: 'Puertos',
          value: specs.ports && specs.ports.length > 0 ? specs.ports.join(', ') : null,
        },
      ],
    },
    {
      title: 'Software y extras',
      rows: [
        { label: 'Sistema', value: specs.os },
        { label: 'Tipo de uso', value: specs.usage_type },
        { label: 'Gama', value: specs.product_line },
        { label: 'Idioma del teclado', value: specs.keyboard_lang },
        { label: 'Optimizado para IA', value: specs.ai_optimized === true ? 'Sí' : null },
      ],
    },
  ]
    .map((g) => ({ ...g, rows: g.rows.filter((r) => r.value !== null) }))
    .filter((g) => g.rows.length > 0);

  return (
    <section>
      <h2 className="mb-3 text-lg font-medium">Especificaciones</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {groups.map((group) => (
          <div
            key={group.title}
            className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
          >
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-400">
              {group.title}
            </h3>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2">
              {group.rows.map((r) => (
                <SpecRow key={r.label} label={r.label} value={r.value} />
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}

function SpecRow({ label, value }: { label: string; value: string | null }) {
  if (value === null) return null;
  return (
    <>
      <dt className="text-sm text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="text-sm text-zinc-900 dark:text-zinc-100">{value}</dd>
    </>
  );
}

function formatEur(value: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}

// Date.now() es impuro a ojos del React Compiler. En un Server Component que
// se renderiza una sola vez por request da igual, pero el linter no lo sabe.
// Encapsulado aquí para mantener el cuerpo del componente "puro".
function historyStartISO(): string {
  return new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function formatDayShort(dateISO: string): string {
  // 'YYYY-MM-DD' → '20 feb'. UTC para evitar drift por TZ del servidor.
  const d = new Date(dateISO + 'T00:00:00Z');
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(d);
}
