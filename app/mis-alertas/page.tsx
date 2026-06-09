import Link from 'next/link';
import { redirect } from 'next/navigation';

import type { Tables } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/server';

import { deletePriceAlertForm } from '../portatiles/[slug]/actions';

type SearchParams = { message?: string };

type AlertRow = Pick<
  Tables<'price_alerts'>,
  'id' | 'laptop_id' | 'baseline_price_eur' | 'created_at'
>;
type LaptopRef = Pick<Tables<'laptops'>, 'id' | 'slug' | 'brand' | 'model'>;

export default async function MisAlertasPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { message } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?error=' + encodeURIComponent('Inicia sesión para ver tus alertas.'));
  }

  // La RLS limita el SELECT a las del usuario.
  const { data: alerts, error } = await supabase
    .from('price_alerts')
    .select('id, laptop_id, baseline_price_eur, created_at')
    .order('created_at', { ascending: false })
    .returns<AlertRow[]>();

  if (error) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="mb-2 text-3xl font-semibold tracking-tight">Mis alertas</h1>
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
          Error consultando Supabase: {error.message}
        </div>
      </main>
    );
  }

  const ids = (alerts ?? []).map((a) => a.laptop_id);
  const laptopsById = new Map<string, LaptopRef>();
  const currentById = new Map<string, number>();
  if (ids.length > 0) {
    const [{ data: laptops }, { data: prices }] = await Promise.all([
      supabase.from('laptops').select('id, slug, brand, model').in('id', ids).returns<LaptopRef[]>(),
      supabase
        .rpc('current_min_prices', { p_ids: ids })
        .returns<{ laptop_id: string; min_price: number }[]>(),
    ]);
    for (const l of laptops ?? []) laptopsById.set(l.id, l);
    for (const p of prices ?? []) currentById.set(p.laptop_id, Number(p.min_price));
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Mis alertas</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Te avisaremos por email cuando alguno baje del precio que tenía al crear la alerta.
        </p>
      </header>

      {message && (
        <div className="mb-4 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-100">
          {message}
        </div>
      )}

      {(alerts ?? []).length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Aún no tienes alertas. Entra en la ficha de un portátil y pulsa{' '}
            <em>Avísame si baja de precio</em>.
          </p>
          <Link
            href="/"
            className="mt-3 inline-block text-sm text-cyan-600 underline hover:text-cyan-700"
          >
            Ir al catálogo
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {(alerts ?? []).map((a) => {
            const laptop = laptopsById.get(a.laptop_id);
            const baseline = Number(a.baseline_price_eur);
            const current = currentById.get(a.laptop_id);
            const dropped = current !== undefined && current < baseline;
            return (
              <li
                key={a.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="min-w-0">
                  {laptop ? (
                    <Link
                      href={`/portatiles/${laptop.slug}`}
                      className="font-medium hover:underline"
                    >
                      {laptop.brand} {laptop.model}
                    </Link>
                  ) : (
                    <p className="font-medium text-zinc-500">Portátil no disponible</p>
                  )}
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    Al crear: {formatEur(baseline)} · ahora:{' '}
                    {current === undefined ? (
                      <span className="text-zinc-400">sin precio</span>
                    ) : (
                      <span className={dropped ? 'font-medium text-green-600 dark:text-green-400' : ''}>
                        {formatEur(current)}
                        {dropped && ' ↓'}
                      </span>
                    )}
                  </p>
                </div>
                <form action={deletePriceAlertForm}>
                  <input type="hidden" name="laptop_id" value={a.laptop_id} />
                  <button
                    type="submit"
                    className="shrink-0 text-xs text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    quitar
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function formatEur(value: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}
