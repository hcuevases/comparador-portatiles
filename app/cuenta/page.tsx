import Link from 'next/link';
import { redirect } from 'next/navigation';

import { SubmitButton } from '@/components/submit-button';
import { createClient } from '@/lib/supabase/server';

import { deleteAccount } from './actions';

type SearchParams = { error?: string };

export const metadata = {
  title: 'Tu cuenta — comparador',
};

export default async function CuentaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?error=' + encodeURIComponent('Inicia sesión para ver tu cuenta.'));
  }

  // Cuenta cuántas comparativas guardadas tiene, para mostrar al usuario qué
  // perderá si borra la cuenta.
  const { count: comparisonsCount } = await supabase
    .from('comparisons')
    .select('id', { count: 'exact', head: true });

  return (
    <main className="mx-auto max-w-2xl p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Tu cuenta</h1>
      </header>

      <section className="mb-10 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-zinc-500">Email</dt>
          <dd className="font-medium">{user.email}</dd>

          <dt className="text-zinc-500">Comparativas guardadas</dt>
          <dd>{comparisonsCount ?? 0}</dd>

          <dt className="text-zinc-500">Cuenta creada</dt>
          <dd>{formatDate(user.created_at)}</dd>
        </dl>

        <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <Link
            href="/cuenta/password"
            className="text-sm text-cyan-600 underline hover:text-cyan-700"
          >
            Cambiar contraseña
          </Link>
        </div>
      </section>

      {/* Danger zone: borrado de cuenta */}
      <section
        aria-labelledby="danger-zone"
        className="rounded-lg border border-red-300 bg-red-50/40 p-6 dark:border-red-900 dark:bg-red-950/20"
      >
        <h2 id="danger-zone" className="text-lg font-medium text-red-900 dark:text-red-100">
          Borrar cuenta
        </h2>
        <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
          Borrar tu cuenta es permanente y no se puede deshacer. Eliminará:
        </p>
        <ul className="mt-2 list-inside list-disc text-sm text-zinc-700 dark:text-zinc-300">
          <li>Tu email y datos de sesión.</li>
          <li>
            Tus {comparisonsCount ?? 0} comparativas guardadas.
          </li>
        </ul>
        <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">
          Para confirmar, reescribe tu email tal como aparece arriba.
        </p>

        {error && (
          <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
            {error}
          </div>
        )}

        <form action={deleteAccount} className="mt-4 space-y-3">
          <div>
            <label
              htmlFor="confirm_email"
              className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
            >
              Reescribe tu email
            </label>
            <input
              id="confirm_email"
              name="confirm_email"
              type="email"
              autoComplete="off"
              required
              placeholder={user.email ?? ''}
              className="mt-1 block w-full max-w-sm rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>

          <SubmitButton variant="danger" pendingText="Borrando…">
            Borrar mi cuenta permanentemente
          </SubmitButton>
        </form>
      </section>
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
