'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

/**
 * Borrado permanente de cuenta (GDPR, derecho al olvido).
 *
 * Flujo:
 * 1. Comprobar sesión activa.
 * 2. Comprobar que el email reescrito por el usuario coincide con el suyo
 *    (defensa contra clicks accidentales y contra borrar la cuenta equivocada
 *    en sesiones cruzadas).
 * 3. Borrar el usuario con el cliente admin (service role). La FK
 *    `comparisons.user_id ... ON DELETE CASCADE` borra automáticamente sus
 *    comparativas — no hace falta DELETE explícito.
 * 4. Cerrar sesión para limpiar las cookies del navegador.
 * 5. Redirect a / con mensaje.
 */
export async function deleteAccount(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?error=' + encodeURIComponent('Inicia sesión para borrar tu cuenta.'));
  }

  const typedEmail = String(formData.get('confirm_email') ?? '').trim().toLowerCase();
  const userEmail = (user.email ?? '').toLowerCase();

  if (!typedEmail || typedEmail !== userEmail) {
    redirect(
      '/cuenta?error=' +
        encodeURIComponent('El email tipeado no coincide. Borrado cancelado.'),
    );
  }

  const admin = createAdminClient();
  const { error: deleteErr } = await admin.auth.admin.deleteUser(user.id);

  if (deleteErr) {
    redirect(
      '/cuenta?error=' +
        encodeURIComponent('No se pudo borrar la cuenta: ' + deleteErr.message),
    );
  }

  // Cierra sesión del lado del cliente para limpiar cookies.
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');

  redirect(
    '/?message=' +
      encodeURIComponent('Tu cuenta y todas tus comparativas se han borrado permanentemente.'),
  );
}
