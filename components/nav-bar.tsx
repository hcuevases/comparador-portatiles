import Link from 'next/link';

import { signOut } from '@/app/(auth)/actions';
import { createClient } from '@/lib/supabase/server';

/**
 * NavBar global. Server Component: lee la sesión con cookies sin pasar por
 * el cliente. El botón de Logout dispara la server action `signOut`.
 *
 * Se renderiza dentro del root layout, así que aparece en todas las rutas.
 */
export async function NavBar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-8 py-3">
        <Link href="/" className="font-display text-base font-extrabold tracking-tight">
          Comparador
        </Link>

        <nav className="flex items-center gap-4 text-sm">
          <Link
            href="/asistente"
            className="inline-flex items-center gap-1 font-medium text-cyan-600 hover:text-cyan-700 dark:text-cyan-400 dark:hover:text-cyan-300"
          >
            <span aria-hidden>✨</span> Asistente IA
          </Link>
          {user ? (
            <>
              <Link
                href="/mis-comparativas"
                className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Mis comparativas
              </Link>
              <Link
                href="/mis-alertas"
                className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Mis alertas
              </Link>
              <Link
                href="/cuenta"
                className="hidden text-xs text-zinc-500 hover:text-zinc-900 sm:inline dark:hover:text-zinc-100"
              >
                {user.email}
              </Link>
              <form action={signOut}>
                <button
                  type="submit"
                  className="rounded-md border border-zinc-300 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                >
                  Cerrar sesión
                </button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Iniciar sesión
              </Link>
              <Link
                href="/signup"
                className="rounded-md bg-cyan-600 px-3 py-1 text-xs font-medium text-white hover:bg-cyan-700"
              >
                Crear cuenta
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
