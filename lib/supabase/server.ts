/**
 * Cliente de Supabase para Server Components, Route Handlers y Server Actions.
 * Lee/escribe cookies del usuario para mantener la sesión sincronizada.
 *
 * Sigue usando anon key + RLS — el usuario sigue siendo el usuario autenticado.
 * Para operaciones que ignoran RLS (ej. ingesta de precios) usa `./admin.ts`.
 */
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

import type { Database } from './database.types';

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // `setAll` desde un Server Component (no Route Handler / Action).
            // Si usas un middleware que refresque la sesión, esto es esperado.
          }
        },
      },
    },
  );
}
