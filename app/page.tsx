import Link from 'next/link';

import { HomeHero } from '@/components/home-hero';
import { LaptopFilters } from '@/components/laptop-filters';
import { LaptopGrid, type LaptopCard } from '@/components/laptop-grid';
import { Pagination } from '@/components/pagination';
import { SortSelect } from '@/components/sort-select';
import type { Tables } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/server';

// Derivados del esquema generado por `supabase gen types`. Si una columna
// cambia, TS revienta aquí — no hay que sincronizar tipos a mano.
type SpecRow = Pick<
  Tables<'specs'>,
  'laptop_id' | 'cpu' | 'ram_gb' | 'storage_gb' | 'screen_inches' | 'weight_kg'
>;

// Filas que devuelve la RPC `search_laptops`: catálogo + min de precio agregado
// en SQL + total filtrado (count window). Ver db/migrations/0008_search_laptops_rpc.sql.
type SearchRow = {
  id: string;
  slug: string;
  brand: string;
  model: string;
  year: number | null;
  image_url: string | null;
  min_price: number | null;
  total_count: number;
};

type SearchParams = {
  q?: string;
  brand?: string;
  ram_min?: string;
  price_max?: string;
  gaming?: string;
  ai?: string;
  oled?: string;
  cond?: string;
  screen?: string;
  line?: string;
  sort?: string;
  page?: string;
  message?: string;
};

const PAGE_SIZE = 24;

// Umbral mínimo de unidades para que una serie (`product_line`) aparezca en el
// <select>. Descarta la cola de series con 1-2 modelos, donde se concentran los
// mislabels del scraper (portátiles cuya `product_line` no cuadra con su marca).
const MIN_LINE_COUNT = 10;

// Buckets de tamaño de pantalla. `screen_inches` es discreto/aproximado (13, 14,
// 16, 17; el 16 agrupa el rango 15-16 de Algolia), así que filtramos por rango.
// Las claves son las del searchParam `?screen=`. Debe coincidir con SCREEN_OPTIONS
// de components/laptop-filters.tsx.
const SCREEN_BUCKETS: Record<string, { min: number; max: number | null }> = {
  '13': { min: 12, max: 13.9 },
  '14': { min: 14, max: 14.9 },
  '15-16': { min: 15, max: 16.9 },
  '17': { min: 17, max: null },
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const q = (params.q ?? '').trim();
  const brandsFilter = (params.brand ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const ramMin = Number(params.ram_min) || 0;
  const priceMax = Number(params.price_max) || Number.POSITIVE_INFINITY;
  // Pills de características (filtran columnas de `specs` vía inner join).
  const gaming = params.gaming === '1';
  const ai = params.ai === '1';
  const oled = params.oled === '1';
  // Estado del producto (tri-estado, ?cond=): undefined=todos, false=solo nuevos,
  // true=solo reacondicionados. Mapea a p_refurbished de search_laptops (0020).
  const refurbished = params.cond === 'nuevos' ? false : params.cond === 'reacond' ? true : undefined;
  const screenBucket = SCREEN_BUCKETS[params.screen ?? ''];
  const line = (params.line ?? '').trim();
  const message = params.message;
  const page = Math.max(1, Number(params.page) || 1);

  // Query string actual (página + filtros) para que las fichas sepan a dónde
  // volver. Excluimos `message` (feedback transitorio que no debe persistir).
  const catalogQuery = buildCatalogQuery(params);

  const supabase = await createClient();

  // 1) Marcas distintas del catálogo, para los pills del filtro. Vía RPC porque
  //    `select('brand')` sobre toda la tabla choca con el límite de 1000 filas de
  //    PostgREST con el catálogo grande (~3800) y dejaba fuera marcas.
  const { data: brandRows, error: brandsErr } = await supabase
    .rpc('distinct_brands')
    .returns<{ brand: string }[]>();

  if (brandsErr) {
    return (
      <main className="mx-auto max-w-5xl p-8">
        <ErrorBox title="Error consultando Supabase" message={brandsErr.message} />
      </main>
    );
  }

  const allBrands = (brandRows ?? []).map((r) => r.brand);

  // 1b) Series (product_line) distintas para el <select> del filtro. Mismo motivo
  //     que las marcas: vía RPC para esquivar el límite de 1000 filas de PostgREST.
  //     Filtramos por MIN_LINE_COUNT para no listar la cola de series con 1-2
  //     unidades (ruido/mislabels), pero la serie ya seleccionada se incluye
  //     siempre aunque esté por debajo del umbral, para no romper el <select>.
  const { data: lineRows } = await supabase
    .rpc('distinct_product_lines')
    .returns<{ product_line: string; n: number }[]>();

  const productLines = (lineRows ?? [])
    .filter((r) => r.n >= MIN_LINE_COUNT || r.product_line === line)
    .map((r) => ({ value: r.product_line, count: r.n }));

  // 2) Búsqueda + filtros (texto/marca/specs/precio) + paginación + count en una
  //    sola RPC server-side. El filtro de precio máximo va en el WHERE de la
  //    función, así que el total es EXACTO (antes era client-side y el count
  //    sobreestimaba). El min de precio se agrega en SQL — no traemos todo
  //    `prices_history`. Ver db/migrations/0008_search_laptops_rpc.sql.
  const offset = (page - 1) * PAGE_SIZE;
  const { data: rows, error: searchErr } = await supabase
    .rpc('search_laptops', {
      p_q: q ? escapeIlike(q) : undefined,
      p_brands: brandsFilter.length > 0 ? brandsFilter : undefined,
      p_ram_min: ramMin,
      p_price_max: priceMax === Number.POSITIVE_INFINITY ? undefined : priceMax,
      p_gaming: gaming,
      p_ai: ai,
      p_oled: oled,
      // tri-estado (0020): undefined=todos, false=solo nuevos, true=solo reacond.
      p_refurbished: refurbished,
      p_screen_min: screenBucket?.min,
      p_screen_max: screenBucket?.max ?? undefined,
      p_product_line: line || undefined,
      p_sort: params.sort || undefined,
      p_limit: PAGE_SIZE,
      p_offset: offset,
    })
    .returns<SearchRow[]>();

  if (searchErr) {
    return (
      <main className="mx-auto max-w-5xl p-8">
        <ErrorBox title="Error consultando Supabase" message={searchErr.message} />
      </main>
    );
  }

  const laptops = rows ?? [];
  const ids = laptops.map((l) => l.id);

  // Specs solo de la página actual (≤ PAGE_SIZE ids) para pintar las cards.
  const { data: specsData } = await supabase
    .from('specs')
    .select('laptop_id, cpu, ram_gb, storage_gb, screen_inches, weight_kg')
    .in('laptop_id', ids)
    .returns<SpecRow[]>();

  const specsByLaptop = new Map<string, SpecRow>();
  for (const s of specsData ?? []) specsByLaptop.set(s.laptop_id, s);

  // El total filtrado viaja en cada fila (count(*) over()); en una página válida
  // siempre hay ≥ 1 fila. Solo es 0 cuando no hay resultados.
  const totalCount = laptops.length > 0 ? laptops[0].total_count : 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return renderPage(
    laptops,
    specsByLaptop,
    allBrands,
    productLines,
    totalCount,
    page,
    totalPages,
    params,
    catalogQuery,
    message,
  );
}

function renderPage(
  laptops: SearchRow[],
  specsByLaptop: Map<string, SpecRow>,
  allBrands: string[],
  productLines: { value: string; count: number }[],
  totalCount: number,
  currentPage: number,
  totalPages: number,
  searchParams: SearchParams,
  catalogQuery: string,
  message?: string,
) {
  const cards: LaptopCard[] = laptops.map((l) => ({
    id: l.id,
    slug: l.slug,
    brand: l.brand,
    model: l.model,
    year: l.year,
    image_url: l.image_url,
    specs: specsByLaptop.get(l.id) ?? null,
    minPriceEur: l.min_price,
  }));

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-8">
      <HomeHero />

      <header className="mb-4">
        <h2 className="font-display text-2xl font-bold tracking-tight">Explora el catálogo</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Filtra a tu gusto y marca 2-4 portátiles para comparar lado a lado.
        </p>
      </header>

      {message && (
        <div className="mb-4 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-100">
          {message}
        </div>
      )}

      <LaptopFilters brands={allBrands} productLines={productLines} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">
          {totalCount === 0
            ? 'Sin resultados con los filtros actuales.'
            : `${totalCount} ${totalCount === 1 ? 'portátil' : 'portátiles'} en total · página ${currentPage} de ${totalPages}`}
        </p>
        {totalCount > 0 && <SortSelect />}
      </div>

      {cards.length === 0 ? (
        <EmptyState query={searchParams.q} />
      ) : (
        <LaptopGrid laptops={cards} backQuery={catalogQuery} />
      )}

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        basePath="/"
        searchParams={searchParams}
      />
    </main>
  );
}

function EmptyState({ query }: { query?: string }) {
  const q = (query ?? '').trim();
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
      <h2 className="text-lg font-bold">Nada que mostrar.</h2>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Prueba a ampliar los filtros{q ? ', o deja que la IA lo busque por ti' : ' o pulsa limpiar filtros arriba'}.
      </p>
      <Link
        href={q ? `/asistente?q=${encodeURIComponent(q)}` : '/asistente'}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-700"
      >
        <span aria-hidden>✨</span> {q ? `Pregúntale a la IA por "${q.slice(0, 30)}"` : 'Pregúntale a la IA'}
      </Link>
    </div>
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

/**
 * Escapa los caracteres especiales de ILIKE (% y _) para que el usuario no
 * pueda inyectar comodines accidentalmente al teclear.
 */
function escapeIlike(input: string): string {
  return input.replace(/[%_\\]/g, (m) => `\\${m}`);
}

/**
 * Serializa los searchParams actuales (página + filtros) a un query string,
 * omitiendo `message` (banner transitorio). Lo usan las fichas vía `?from=`
 * para reconstruir el enlace "Volver al catálogo" con la página y filtros de
 * origen.
 */
function buildCatalogQuery(params: SearchParams): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k === 'message') continue;
    if (v) sp.set(k, v);
  }
  return sp.toString();
}
