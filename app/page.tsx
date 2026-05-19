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
  observed_at: string;
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
      .select('laptop_id, price_eur, observed_at')
      .in('laptop_id', ids)
      .order('observed_at', { ascending: false })
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

  return (
    <main className="mx-auto max-w-5xl p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Comparador de portátiles</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Smoke test: leyendo del Postgres de Supabase con el cliente server-side y RLS público.
        </p>
      </header>

      {(!laptops || laptops.length === 0) && (
        <EmptyState />
      )}

      {laptops && laptops.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {laptops.map((l) => {
            const specs = specsByLaptop.get(l.id);
            const minPrice = minPriceByLaptop.get(l.id);
            return (
              <li
                key={l.id}
                className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                <p className="text-sm text-zinc-500 dark:text-zinc-400">{l.brand}</p>
                <h2 className="text-lg font-medium leading-tight">{l.model}</h2>
                {l.year && (
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{l.year}</p>
                )}

                {specs && (
                  <dl className="mt-3 grid grid-cols-2 gap-y-1 text-xs text-zinc-700 dark:text-zinc-300">
                    {specs.cpu && (
                      <>
                        <dt className="text-zinc-500">CPU</dt>
                        <dd>{specs.cpu}</dd>
                      </>
                    )}
                    {specs.ram_gb !== null && (
                      <>
                        <dt className="text-zinc-500">RAM</dt>
                        <dd>{specs.ram_gb} GB</dd>
                      </>
                    )}
                    {specs.storage_gb !== null && (
                      <>
                        <dt className="text-zinc-500">SSD</dt>
                        <dd>{specs.storage_gb} GB</dd>
                      </>
                    )}
                    {specs.screen_inches !== null && (
                      <>
                        <dt className="text-zinc-500">Pantalla</dt>
                        <dd>{specs.screen_inches}″</dd>
                      </>
                    )}
                    {specs.weight_kg !== null && (
                      <>
                        <dt className="text-zinc-500">Peso</dt>
                        <dd>{specs.weight_kg} kg</dd>
                      </>
                    )}
                  </dl>
                )}

                {minPrice !== undefined ? (
                  <p className="mt-3 text-sm font-medium">
                    Desde {formatEur(minPrice)}
                  </p>
                ) : (
                  <p className="mt-3 text-xs text-zinc-400">Sin precio aún</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
      <h2 className="text-lg font-medium">Aún no hay portátiles en la base de datos.</h2>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        La conexión a Supabase funciona — solo falta cargar datos. Ejecuta{' '}
        <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs dark:bg-zinc-900">
          db/migrations/0002_seed.sql
        </code>{' '}
        en el SQL Editor de Supabase y recarga esta página.
      </p>
    </div>
  );
}

function ErrorBox({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
      <h2 className="font-medium">{title}</h2>
      <pre className="mt-2 whitespace-pre-wrap text-xs">{message}</pre>
      <p className="mt-2 text-xs">
        Comprueba <code>.env.local</code> (URL y anon key) y que la migración{' '}
        <code>0001_init.sql</code> se haya ejecutado.
      </p>
    </div>
  );
}

function formatEur(value: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}
