import { redirect } from 'next/navigation';

import { SubmitButton } from '@/components/submit-button';
import { createClient } from '@/lib/supabase/server';

import { updatePassword } from './actions';

type SearchParams = { error?: string };

export const metadata = {
  title: 'Cambiar contraseña — comparador',
};

export default async function UpdatePasswordPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { error } = await searchParams;

  // Requiere sesión. Llega aquí (a) tras el enlace de reset (/auth/confirm verificó
  // el OTP y creó sesión) o (b) un usuario logueado desde /cuenta. Sin sesión, al
  // login con instrucciones.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      '/login?error=' +
        encodeURIComponent(
          'Necesitas un enlace válido para cambiar la contraseña. Solicita uno nuevo.',
        ),
    );
  }

  return (
    <main className="mx-auto max-w-md p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Nueva contraseña</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Elige una contraseña nueva para <span className="font-medium">{user.email}</span>.
        </p>
      </header>

      {error && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
          {error}
        </div>
      )}

      <form action={updatePassword} className="space-y-4">
        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Nueva contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <p className="mt-1 text-xs text-zinc-500">Mínimo 6 caracteres.</p>
        </div>

        <div>
          <label
            htmlFor="confirm_password"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Repite la contraseña
          </label>
          <input
            id="confirm_password"
            name="confirm_password"
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>

        <SubmitButton pendingText="Guardando…" fullWidth>
          Guardar contraseña
        </SubmitButton>
      </form>
    </main>
  );
}
