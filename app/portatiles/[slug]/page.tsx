import Image from 'next/image';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { AddToCompareButton } from '@/components/add-to-compare-button';
import { BackToCatalog, BackToCatalogFallback } from '@/components/back-to-catalog';
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
          'cpu, cpu_cores, ram_gb, storage_gb, storage_type, gpu, gpu_vram_gb, screen_inches, screen_resolution, screen_refresh_hz, screen_panel_type, weight_kg, battery_wh, ports, os, usage_type, keyboard_lang, ai_optimized, product_line',
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
    <main className="mx-auto max-w-5xl p-8">
      <nav className="mb-6 text-sm">
        <Suspense fallback={<BackToCatalogFallback />}>
          <BackToCatalog />
        </Suspense>
      </nav>

      <header className="mb-8 grid gap-6 sm:grid-cols-[auto_1fr] sm:items-start">
        {laptop.image_url && (
          <div className="relative h-56 w-56 shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <Image
              src={laptop.image_url}
              alt={`${laptop.brand} ${laptop.model}`}
              fill
              sizes="224px"
              className="object-contain p-2"
              priority
            />
          </div>
        )}
        <div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{laptop.brand}</p>
          <h1 className="text-3xl font-semibold tracking-tight">{laptop.model}</h1>
          {laptop.year && (
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{laptop.year}</p>
          )}
          {laptop.slug.endsWith('-refurbished') && (
            <span className="mt-2 inline-block rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              Reacondicionado
            </span>
          )}
          {laptop.description && (
            <p className="mt-4 max-w-2xl text-zinc-700 dark:text-zinc-300">
              {laptop.description}
            </p>
          )}
          {minPrice !== null && (
            <p className="mt-4 text-lg font-medium">Desde {formatEur(minPrice)}</p>
          )}
          <AddToCompareButton laptopId={laptop.id} />
        </div>
      </header>

      {retailerCards.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-lg font-medium">Disponible en</h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {retailerCards.map(({ retailer, link, latest }) => (
              <li
                key={retailer.id}
                className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div>
                  <p className="font-medium">{retailer.name}</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {formatEur(latest.price_eur)}{' '}
                    <span className="text-xs text-zinc-400">
                      · actualizado {formatDayShort(latest.observed_at.slice(0, 10))}
                    </span>
                  </p>
                </div>
                {link ? (
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer sponsored"
                    className="inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    Ir a {retailer.name} →
                  </a>
                ) : (
                  <span className="text-xs text-zinc-400">Sin enlace afiliado</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {chartData.length > 0 && series.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-lg font-medium">Histórico de precios (90 días)</h2>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <PriceHistoryChart data={chartData} series={series} />
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Los precios mostrados son orientativos y se actualizan periódicamente. Comprueba el
            precio final en la web del retailer antes de comprar.
          </p>
        </section>
      )}

      {specs && (
        <section>
          <h2 className="mb-3 text-lg font-medium">Especificaciones</h2>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-2 rounded-lg border border-zinc-200 bg-white p-6 sm:grid-cols-[max-content_1fr] dark:border-zinc-800 dark:bg-zinc-950">
            <SpecRow label="CPU" value={specs.cpu} />
            <SpecRow
              label="Núcleos"
              value={specs.cpu_cores ? `${specs.cpu_cores} núcleos` : null}
            />
            <SpecRow label="RAM" value={specs.ram_gb ? `${specs.ram_gb} GB` : null} />
            <SpecRow
              label="Almacenamiento"
              value={
                specs.storage_gb
                  ? `${specs.storage_gb} GB${specs.storage_type ? ` (${specs.storage_type})` : ''}`
                  : null
              }
            />
            <SpecRow label="GPU" value={specs.gpu} />
            <SpecRow
              label="VRAM"
              value={specs.gpu_vram_gb ? `${specs.gpu_vram_gb} GB` : null}
            />
            <SpecRow
              label="Pantalla"
              value={
                specs.screen_inches
                  ? `${specs.screen_inches}″${specs.screen_resolution ? ` · ${specs.screen_resolution}` : ''}${specs.screen_refresh_hz ? ` · ${specs.screen_refresh_hz} Hz` : ''}`
                  : null
              }
            />
            <SpecRow label="Tipo de panel" value={specs.screen_panel_type} />
            <SpecRow label="Peso" value={specs.weight_kg ? `${specs.weight_kg} kg` : null} />
            <SpecRow
              label="Batería"
              value={specs.battery_wh ? `${specs.battery_wh} Wh` : null}
            />
            <SpecRow
              label="Puertos"
              value={specs.ports && specs.ports.length > 0 ? specs.ports.join(', ') : null}
            />
            <SpecRow label="Sistema" value={specs.os} />
            <SpecRow label="Tipo de uso" value={specs.usage_type} />
            <SpecRow label="Gama" value={specs.product_line} />
            <SpecRow label="Idioma del teclado" value={specs.keyboard_lang} />
            <SpecRow
              label="Optimizado para IA"
              value={specs.ai_optimized === true ? 'Sí' : null}
            />
          </dl>
        </section>
      )}
    </main>
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
