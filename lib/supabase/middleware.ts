/**
 * Helper de Supabase para el middleware de Next.js.
 *
 * Su único trabajo es refrescar la sesión del usuario en cada request:
 * - Lee las cookies del request.
 * - Crea un cliente server-side de Supabase.
 * - Llama a `supabase.auth.getUser()` que, si el access token está expirado,
 *   intenta renovarlo con el refresh token y escribe las nuevas cookies en
 *   la respuesta.
 *
 * Sin este middleware, las cookies de Supabase no se refrescan y el usuario
 * acaba "deslogueado" silenciosamente cuando el access token caduca.
 */
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import type { Database } from './database.types';

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANTE: no metas lógica entre createServerClient y getUser().
  // Si lo haces, el usuario puede acabar inesperadamente deslogueado por
  // un bug conocido del refresh de cookies.
  await supabase.auth.getUser();

  return supabaseResponse;
}
