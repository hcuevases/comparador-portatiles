'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

import { createClient } from '@/lib/supabase/server';

/**
 * Server actions de autenticación.
 *
 * Patrón: en caso de error, redirigimos a la misma página con ?error=... en la
 * URL para que el form pueda mostrar el mensaje. Es simple, no requiere
 * useActionState, y los enlaces son compartibles (raro pero útil al debuggear).
 *
 * Validación: básica. Supabase impone reglas server-side (email válido, password
 * >= 6 chars). Aquí solo nos aseguramos de no pasar strings vacíos.
 */

function readCredentials(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  return { email, password };
}

export async function signInWithPassword(formData: FormData) {
  const { email, password } = readCredentials(formData);

  if (!email || !password) {
    redirect('/login?error=' + encodeURIComponent('Email y contraseña son obligatorios.'));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect('/login?error=' + encodeURIComponent(error.message));
  }

  revalidatePath('/', 'layout');
  redirect('/');
}

export async function signUp(formData: FormData) {
  const { email, password } = readCredentials(formData);

  if (!email || !password) {
    redirect('/signup?error=' + encodeURIComponent('Email y contraseña son obligatorios.'));
  }

  if (password.length < 6) {
    redirect('/signup?error=' + encodeURIComponent('La contraseña debe tener al menos 6 caracteres.'));
  }

  const supabase = await createClient();

  // emailRedirectTo: a dónde manda Supabase al usuario tras confirmar el email.
  // Calculamos el origen desde las cabeceras del request para que funcione tanto
  // en localhost como en cualquier preview de Vercel sin hard-codear dominios.
  const origin = (await headers()).get('origin') ?? '';

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/confirm`,
    },
  });

  if (error) {
    redirect('/signup?error=' + encodeURIComponent(error.message));
  }

  // No iniciamos sesión automáticamente: el usuario tiene que abrir el email
  // y pulsar el enlace de confirmación. Mostramos un mensaje.
  redirect(
    '/login?message=' +
      encodeURIComponent('Revisa tu email y confirma la cuenta para poder iniciar sesión.'),
  );
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/');
}
