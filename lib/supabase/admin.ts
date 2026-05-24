/**
 * Cliente de Supabase con service role — IGNORA RLS.
 *
 * Úsalo SOLO desde el servidor (scripts de ingesta, jobs de cron, server actions
 * que requieran escritura en tablas protegidas). Nunca lo importes desde un
 * Client Component o Route Handler que devuelva datos sensibles sin filtrar.
 *
 * Requiere SUPABASE_SERVICE_ROLE_KEY en el entorno (jamás expuesto al cliente).
 */
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import type { Database } from './database.types';

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.',
    );
  }

  return createSupabaseClient<Database>(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
