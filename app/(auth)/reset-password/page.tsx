import Link from 'next/link';

import { SubmitButton } from '@/components/submit-button';

import { requestPasswordReset } from '../actions';

type SearchParams = { error?: string };

export const metadata = {
  title: 'Restablecer contraseña — comparador',
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { error } = await searchParams;

  return (
    <>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Restablecer contraseña</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Introduce tu email y te enviaremos un enlace para crear una contraseña nueva.
        </p>
      </header>

      {error && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
          {error}
        </div>
      )}

      <form action={requestPasswordReset} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>

        <SubmitButton pendingText="Enviando…" fullWidth>
          Enviar enlace
        </SubmitButton>

        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link href="/login" className="text-cyan-600 underline hover:text-cyan-700">
            Volver a iniciar sesión
          </Link>
        </p>
      </form>
    </>
  );
}
