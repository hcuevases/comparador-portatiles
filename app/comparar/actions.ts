'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { TablesInsert } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/server';

const UUID_RE = /^[0-9a-fA-F-]{36}$/;
const MAX_COMPARE = 4;
const NAME_MAX_LEN = 100;

/**
 * Guarda la comparativa actual en la tabla `comparisons` del usuario logueado.
 *
 * Inputs (FormData):
 * - ids: string CSV con UUIDs de portátiles (entre 2 y 4).
 * - name: nombre opcional (string libre, <= 100 chars).
 *
 * Si el usuario no está logueado, manda a /login (la RLS también bloquearía
 * el insert, pero esta comprobación da mejor UX al redirigir).
 *
 * is_public se queda en false (default del esquema) — feature de compartir
 * pendiente.
 */
export async function saveComparison(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?error=' + encodeURIComponent('Inicia sesión para guardar comparativas.'));
  }

  const idsRaw = String(formData.get('ids') ?? '');
  const nameRaw = String(formData.get('name') ?? '').trim();

  const ids = idsRaw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => UUID_RE.test(s))
    .slice(0, MAX_COMPARE);

  if (ids.length < 2) {
    redirect(
      '/comparar?ids=' +
        encodeURIComponent(idsRaw) +
        '&error=' +
        encodeURIComponent('Necesitas al menos 2 portátiles para guardar la comparativa.'),
    );
  }

  const name = nameRaw === '' ? null : nameRaw.slice(0, NAME_MAX_LEN);

  // Tipado explícito: el insert genérico de supabase-js no infiere bien el
  // shape desde el cliente cuando hay nullables opcionales. TablesInsert hace
  // explícita la garantía contra el esquema generado.
  const payload: TablesInsert<'comparisons'> = {
    user_id: user.id,
    laptop_ids: ids,
    name,
  };

  // supabase-js en esta versión espera el insert siempre como array, incluso
  // para una sola fila. Sin el array salta TS2345 "not assignable to never[]".
  const { error } = await supabase.from('comparisons').insert([payload]);

  if (error) {
    redirect(
      '/comparar?ids=' +
        encodeURIComponent(ids.join(',')) +
        '&error=' +
        encodeURIComponent('No se pudo guardar: ' + error.message),
    );
  }

  revalidatePath('/mis-comparativas');
  redirect('/mis-comparativas?message=' + encodeURIComponent('Comparativa guardada.'));
}
