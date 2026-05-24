/**
 * Route handler para confirmar el email del usuario.
 *
 * Supabase envía un enlace de la forma:
 *   /auth/confirm?token_hash=...&type=signup&next=/
 *
 * Aquí verificamos el token y, si es válido, creamos sesión y redirigimos a
 * `next` (por defecto la home). Si falla, mandamos a /login con un error.
 *
 * Este mismo handler sirve para signup, magic link, y reset password —
 * Supabase reutiliza el flujo cambiando solo el `type`.
 */
import { type EmailOtpType } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { type NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/';

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      redirect(next);
    }
  }

  redirect('/login?error=' + encodeURIComponent('Enlace de confirmación inválido o expirado.'));
}
