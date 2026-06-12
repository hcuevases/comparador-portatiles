import Link from 'next/link';
import { redirect } from 'next/navigation';

import type { Tables } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/server';

type SearchParams = { message?: string };

type ComparisonRow = Pick<
  Tables<'comparisons'>,
  'id' | 'name' | 'laptop_ids' | 'created_at'
>;

type LaptopRef = Pick<Tables<'laptops'>, 'id' | 'brand' | 'model'>;

export default async function MisComparativasPage({
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
    redirect('/login?error=' + encodeURIComponent('Inicia sesión para ver tus comparativas.'));
  }

  // La RLS limita el SELECT a las del usuario; no hace falta filtrar por user_id.
  const { data: comparisons, error } = await supabase
    .from('comparisons')
    .select('id, name, laptop_ids, created_at')
    .order('created_at', { ascending: false })
    .returns<ComparisonRow[]>();

  if (error) {
    return (
      <main className="mx-auto w-full max-w-3xl p-8">
        <h1 className="mb-2 text-3xl font-semibold tracking-tight">Mis comparativas</h1>
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
          Error consultando Supabase: {error.message}
        </div>
      </main>
    );
  }

  // Resolver nombres de los laptops referenciados en cualquier comparativa.
  // Una sola query con `in` sobre todos los ids únicos.
  const allIds = Array.from(new Set((comparisons ?? []).flatMap((c) => c.laptop_ids)));
  const laptopsById = new Map<string, LaptopRef>();
  if (allIds.length > 0) {
    const { data: laptops } = await supabase
      .from('laptops')
      .select('id, brand, model')
      .in('id', allIds)
      .returns<LaptopRef[]>();
    for (const l of laptops ?? []) laptopsById.set(l.id, l);
  }

  return (
    <main className="mx-auto w-full max-w-3xl p-8">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Mis comparativas</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Comparativas que has guardado. Pulsa cualquiera para volver a abrirla.
        </p>
      </header>

      {message && (
        <div className="mb-4 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-100">
          {message}
        </div>
      )}

      {(comparisons ?? []).length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Aún no has guardado ninguna comparativa.
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
          {(comparisons ?? []).map((c) => {
            const labels = c.laptop_ids
              .map((id) => laptopsById.get(id))
              .filter((l): l is LaptopRef => Boolean(l))
              .map((l) => `${l.brand} ${l.model}`);
            const href = `/comparar?ids=${c.laptop_ids.join(',')}`;
            return (
              <li
                key={c.id}
                className="rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
              >
                <Link href={href} className="block">
                  <p className="font-medium">{c.name ?? 'Sin nombre'}</p>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {labels.length > 0 ? labels.join(' · ') : `${c.laptop_ids.length} portátiles`}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">{formatDate(c.created_at)}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}
