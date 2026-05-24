/**
 * Cliente de Supabase para el navegador (Client Components).
 * Usa la anon key — todas las operaciones se filtran por RLS.
 *
 * Para Server Components y Route Handlers usa `./server.ts`.
 * Para tareas administrativas (scripts/jobs) usa `./admin.ts`.
 */
import { createBrowserClient } from '@supabase/ssr';

import type { Database } from './database.types';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
