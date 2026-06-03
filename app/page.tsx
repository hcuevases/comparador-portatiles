import { LaptopFilters } from '@/components/laptop-filters';
import { LaptopGrid, type LaptopCard } from '@/components/laptop-grid';
import { Pagination } from '@/components/pagination';
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
  refurbished?: string;
  page?: string;
  message?: string;
};

const PAGE_SIZE = 24;

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
  const refurbished = params.refurbished === '1';
  const message = params.message;
  const page = Math.max(1, Number(params.page) || 1);

  // Query string actual (página + filtros) para que las fichas sepan a dónde
  // volver. Excluimos `message` (feedback transitorio que no debe persistir).
  const catalogQuery = buildCatalogQuery(params);

  const supabase = await createClient();

  // 1) Marcas del catálogo completo, para los pills del filtro.
  const { data: allBrandsRows, error: brandsErr } = await supabase
    .from('laptops')
    .select('brand')
    .returns<{ brand: string }[]>();

  if (brandsErr) {
    return (
      <main className="mx-auto max-w-5xl p-8">
        <ErrorBox title="Error consultando Supabase" message={brandsErr.message} />
      </main>
    );
  }

  const allBrands = Array.from(new Set((allBrandsRows ?? []).map((r) => r.brand))).sort();

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
      p_refurbished: refurbished,
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
    <main className="mx-auto max-w-5xl p-8">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Comparador de portátiles</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Marca 2-4 portátiles y pulsa Comparar para verlos lado a lado.
        </p>
      </header>

      {message && (
        <div className="mb-4 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-100">
          {message}
        </div>
      )}

      <LaptopFilters brands={allBrands} />

      <p className="mb-4 text-xs text-zinc-500">
        {totalCount === 0
          ? 'Sin resultados con los filtros actuales.'
          : `${totalCount} ${totalCount === 1 ? 'portátil' : 'portátiles'} en total · página ${currentPage} de ${totalPages}`}
      </p>

      {cards.length === 0 ? (
        <EmptyState />
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

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
      <h2 className="text-lg font-medium">Nada que mostrar.</h2>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Prueba a ampliar los filtros o pulsa <em>limpiar filtros</em> arriba.
      </p>
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
