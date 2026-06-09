'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

/**
 * Fija una contraseña nueva para el usuario con sesión activa.
 *
 * Sirve a dos casos con el mismo código, porque ambos llegan con una sesión
 * válida en cookies:
 *   1. Flujo de reset: /auth/confirm verificó el OTP `type=recovery` y creó sesión,
 *      luego redirigió aquí (next=/cuenta/password).
 *   2. Usuario ya logueado que quiere cambiar su contraseña desde /cuenta.
 *
 * No exige re-autenticación (security_update_password_require_reauthentication=false
 * en el proyecto); la posesión de la sesión basta.
 */
export async function updatePassword(formData: FormData) {
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm_password') ?? '');

  if (password.length < 6) {
    redirect(
      '/cuenta/password?error=' +
        encodeURIComponent('La contraseña debe tener al menos 6 caracteres.'),
    );
  }

  if (password !== confirm) {
    redirect(
      '/cuenta/password?error=' + encodeURIComponent('Las contraseñas no coinciden.'),
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      '/login?error=' +
        encodeURIComponent('El enlace ha expirado. Vuelve a solicitar el restablecimiento.'),
    );
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect('/cuenta/password?error=' + encodeURIComponent(error.message));
  }

  revalidatePath('/', 'layout');
  redirect('/?message=' + encodeURIComponent('Contraseña actualizada correctamente.'));
}
