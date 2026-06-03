import { LaptopFilters } from '@/components/laptop-filters';
import { LaptopGrid, type LaptopCard } from '@/components/laptop-grid';
import { Pagination } from '@/components/pagination';
import type { Tables } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/server';

// Derivados del esquema generado por `supabase gen types`. Si una columna
// cambia, TS revienta aquí — no hay que sincronizar tipos a mano.
type LaptopRow = Pick<Tables<'laptops'>, 'id' | 'slug' | 'brand' | 'model' | 'year' | 'image_url'>;
type SpecRow = Pick<
  Tables<'specs'>,
  'laptop_id' | 'cpu' | 'ram_gb' | 'storage_gb' | 'screen_inches' | 'weight_kg'
>;
type PriceRow = Pick<Tables<'prices_history'>, 'laptop_id' | 'price_eur'>;

type SearchParams = {
  q?: string;
  brand?: string;
  ram_min?: string;
  price_max?: string;
  gaming?: string;
  ai?: string;
  oled?: string;
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

  // 2) Query principal de laptops con filtros de texto/marca/specs + paginación
  //    server-side via range(). `count: 'exact'` devuelve el total filtrado
  //    para poder calcular total de páginas.
  //
  //    Los filtros sobre columnas de `specs` (RAM, gaming, IA, OLED) se aplican
  //    con un inner join (`specs!inner`) en lugar de pre-filtrar ids y pasarlos
  //    a `.in('id', ...)`: así el `count` sale exacto y evitamos que cientos de
  //    UUIDs en el query string superen el límite de ~8KB de PostgREST. La
  //    relación specs↔laptops es 1:1, así que el join no duplica filas.
  const hasSpecFilter = ramMin > 0 || gaming || ai || oled;
  const selectCols = hasSpecFilter
    ? 'id, slug, brand, model, year, image_url, specs!inner(laptop_id)'
    : 'id, slug, brand, model, year, image_url';

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  let query = supabase
    .from('laptops')
    .select(selectCols, { count: 'exact' })
    .order('brand', { ascending: true })
    .order('id', { ascending: true }) // tiebreaker estable para que la paginación no baile
    .range(from, to);

  if (q) {
    // ilike es case-insensitive; .or compone "brand ILIKE ... OR model ILIKE ..."
    const pattern = `%${escapeIlike(q)}%`;
    query = query.or(`brand.ilike.${pattern},model.ilike.${pattern}`);
  }
  if (brandsFilter.length > 0) {
    query = query.in('brand', brandsFilter);
  }
  if (ramMin > 0) {
    query = query.gte('specs.ram_gb', ramMin);
  }
  if (gaming) {
    query = query.eq('specs.usage_type', 'Gaming');
  }
  if (ai) {
    query = query.eq('specs.ai_optimized', true);
  }
  if (oled) {
    query = query.in('specs.screen_panel_type', ['OLED', 'AMOLED']);
  }

  const { data: laptops, error: laptopsErr, count: totalCount } =
    await query.returns<LaptopRow[]>();

  if (laptopsErr) {
    return (
      <main className="mx-auto max-w-5xl p-8">
        <ErrorBox title="Error consultando Supabase" message={laptopsErr.message} />
      </main>
    );
  }

  const ids = (laptops ?? []).map((l) => l.id);

  const [{ data: specsData }, { data: pricesData }] = await Promise.all([
    supabase
      .from('specs')
      .select('laptop_id, cpu, ram_gb, storage_gb, screen_inches, weight_kg')
      .in('laptop_id', ids)
      .returns<SpecRow[]>(),
    supabase
      .from('prices_history')
      .select('laptop_id, price_eur')
      // Sin .in() — con cientos de UUIDs el query string supera los ~8KB que
      // PostgREST acepta y algunos IDs se cortan silenciosamente, dejando
      // laptops "sin precio" en el frontend aunque sí los tengan en BD.
      // Traemos todo y filtramos en cliente (el Map solo consulta los ids del
      // scope actual). TODO crítico: cuando prices_history pase de 10-20k
      // filas, mover a RPC `min_price_by_laptop(ids uuid[])` en Supabase
      // que devuelva ya agregado server-side.
      .limit(50_000)
      .returns<PriceRow[]>(),
  ]);

  const specsByLaptop = new Map<string, SpecRow>();
  for (const s of specsData ?? []) specsByLaptop.set(s.laptop_id, s);

  const minPriceByLaptop = new Map<string, number>();
  for (const p of pricesData ?? []) {
    const cur = minPriceByLaptop.get(p.laptop_id);
    if (cur === undefined || p.price_eur < cur) {
      minPriceByLaptop.set(p.laptop_id, p.price_eur);
    }
  }

  // 3) Filtro de precio máximo: client-side sobre la página actual. Aún no
  //    tenemos un agregado server-side de min(price); cuando hagamos la RPC
  //    `min_price_by_laptop` lo movemos al WHERE y el conteo total será exacto.
  //    Limitación actual: con filtro de precio activo, una página puede
  //    mostrar < PAGE_SIZE items y el total estará sobreestimado.
  let filteredLaptops = laptops ?? [];
  if (priceMax !== Number.POSITIVE_INFINITY) {
    filteredLaptops = filteredLaptops.filter((l) => {
      const price = minPriceByLaptop.get(l.id);
      return price !== undefined && price <= priceMax;
    });
  }

  const totalPages = Math.max(1, Math.ceil((totalCount ?? 0) / PAGE_SIZE));

  return renderPage(
    filteredLaptops,
    specsByLaptop,
    minPriceByLaptop,
    allBrands,
    totalCount ?? 0,
    page,
    totalPages,
    params,
    catalogQuery,
    message,
  );
}

function renderPage(
  filteredLaptops: LaptopRow[],
  specsByLaptop: Map<string, SpecRow>,
  minPriceByLaptop: Map<string, number>,
  allBrands: string[],
  totalCount: number,
  currentPage: number,
  totalPages: number,
  searchParams: SearchParams,
  catalogQuery: string,
  message?: string,
) {
  const cards: LaptopCard[] = filteredLaptops.map((l) => ({
    id: l.id,
    slug: l.slug,
    brand: l.brand,
    model: l.model,
    year: l.year,
    image_url: l.image_url,
    specs: specsByLaptop.get(l.id) ?? null,
    minPriceEur: minPriceByLaptop.get(l.id) ?? null,
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
