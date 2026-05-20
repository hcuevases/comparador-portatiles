import { LaptopFilters } from '@/components/laptop-filters';
import { LaptopGrid, type LaptopCard } from '@/components/laptop-grid';
import { createClient } from '@/lib/supabase/server';

type LaptopRow = {
  id: string;
  slug: string;
  brand: string;
  model: string;
  year: number | null;
};

type SpecRow = {
  laptop_id: string;
  cpu: string | null;
  ram_gb: number | null;
  storage_gb: number | null;
  screen_inches: number | null;
  weight_kg: number | null;
};

type PriceRow = {
  laptop_id: string;
  price_eur: number;
};

type SearchParams = {
  q?: string;
  brand?: string;
  ram_min?: string;
  price_max?: string;
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

  // 2) Si hay filtro de RAM, pre-filtra ids vía specs.
  let allowedIds: string[] | null = null;
  if (ramMin > 0) {
    const { data: specIds } = await supabase
      .from('specs')
      .select('laptop_id')
      .gte('ram_gb', ramMin)
      .returns<{ laptop_id: string }[]>();
    allowedIds = (specIds ?? []).map((s) => s.laptop_id);
    if (allowedIds.length === 0) {
      return renderPage([], new Map(), new Map(), allBrands);
    }
  }

  // 3) Query principal de laptops con filtros de texto/marca.
  let query = supabase
    .from('laptops')
    .select('id, slug, brand, model, year')
    .order('brand', { ascending: true })
    .limit(50);

  if (q) {
    // ilike es case-insensitive; .or compone "brand ILIKE ... OR model ILIKE ..."
    const pattern = `%${escapeIlike(q)}%`;
    query = query.or(`brand.ilike.${pattern},model.ilike.${pattern}`);
  }
  if (brandsFilter.length > 0) {
    query = query.in('brand', brandsFilter);
  }
  if (allowedIds) {
    query = query.in('id', allowedIds);
  }

  const { data: laptops, error: laptopsErr } = await query.returns<LaptopRow[]>();

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
      .in('laptop_id', ids)
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

  // 4) Filtro de precio máximo (cliente-side: requiere min price ya calculado).
  let filteredLaptops = laptops ?? [];
  if (priceMax !== Number.POSITIVE_INFINITY) {
    filteredLaptops = filteredLaptops.filter((l) => {
      const price = minPriceByLaptop.get(l.id);
      return price !== undefined && price <= priceMax;
    });
  }

  return renderPage(filteredLaptops, specsByLaptop, minPriceByLaptop, allBrands);
}

function renderPage(
  filteredLaptops: LaptopRow[],
  specsByLaptop: Map<string, SpecRow>,
  minPriceByLaptop: Map<string, number>,
  allBrands: string[],
) {
  const cards: LaptopCard[] = filteredLaptops.map((l) => ({
    id: l.id,
    slug: l.slug,
    brand: l.brand,
    model: l.model,
    year: l.year,
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

      <LaptopFilters brands={allBrands} />

      <p className="mb-4 text-xs text-zinc-500">
        {cards.length === 0
          ? 'Sin resultados con los filtros actuales.'
          : `${cards.length} ${cards.length === 1 ? 'portátil' : 'portátiles'} encontrados.`}
      </p>

      {cards.length === 0 ? <EmptyState /> : <LaptopGrid laptops={cards} />}
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
