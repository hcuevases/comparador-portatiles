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

export default async function Home() {
  const supabase = await createClient();

  const { data: laptops, error: laptopsErr } = await supabase
    .from('laptops')
    .select('id, slug, brand, model, year')
    .order('brand', { ascending: true })
    .limit(20)
    .returns<LaptopRow[]>();

  if (laptopsErr) {
    return (
      <main className="mx-auto max-w-4xl p-8">
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

  const cards: LaptopCard[] = (laptops ?? []).map((l) => ({
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
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Comparador de portátiles</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Marca 2-4 portátiles y pulsa Comparar para verlos lado a lado.
        </p>
      </header>

      {cards.length === 0 ? <EmptyState /> : <LaptopGrid laptops={cards} />}
    </main>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
      <h2 className="text-lg font-medium">Aún no hay portátiles en la base de datos.</h2>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Ejecuta{' '}
        <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs dark:bg-zinc-900">
          db/migrations/0002_seed.sql
        </code>{' '}
        en el SQL Editor de Supabase y recarga.
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
