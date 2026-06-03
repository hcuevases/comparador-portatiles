'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { TablesInsert } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/server';

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

type ActionResult = { ok: boolean; error?: string };

/**
 * Crea (o refresca) una alerta de bajada de precio para `laptopId`, con baseline
 * = precio actual (último por retailer → mínimo, vía RPC `current_min_prices`).
 * Login-gated (la RLS también lo exige). Devuelve un resultado para que el botón
 * cliente actualice su estado sin recargar.
 */
export async function createPriceAlert(laptopId: string): Promise<ActionResult> {
  if (!UUID_RE.test(laptopId)) return { ok: false, error: 'ID inválido.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Inicia sesión para crear una alerta.' };

  const { data: prices } = await supabase
    .rpc('current_min_prices', { p_ids: [laptopId] })
    .returns<{ laptop_id: string; min_price: number }[]>();
  const baseline = prices?.[0]?.min_price ?? null;
  if (baseline === null) {
    return { ok: false, error: 'Este portátil no tiene precio ahora mismo.' };
  }

  // upsert por (user_id, laptop_id): si ya existe, reajusta el baseline al actual
  // y resetea el último notificado (empezamos a vigilar desde el precio de hoy).
  const payload: TablesInsert<'price_alerts'> = {
    user_id: user.id,
    laptop_id: laptopId,
    baseline_price_eur: baseline,
    last_notified_price_eur: null,
  };
  const { error } = await supabase
    .from('price_alerts')
    .upsert([payload], { onConflict: 'user_id,laptop_id' });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/mis-alertas');
  return { ok: true };
}

/** Borra la alerta del usuario para `laptopId`. Para el botón cliente de la ficha. */
export async function deletePriceAlert(laptopId: string): Promise<ActionResult> {
  if (!UUID_RE.test(laptopId)) return { ok: false, error: 'ID inválido.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Inicia sesión.' };

  const { error } = await supabase
    .from('price_alerts')
    .delete()
    .eq('user_id', user.id)
    .eq('laptop_id', laptopId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/mis-alertas');
  return { ok: true };
}

/** Variante para `<form action>` de la página /mis-alertas (lee FormData + redirect). */
export async function deletePriceAlertForm(formData: FormData) {
  const laptopId = String(formData.get('laptop_id') ?? '');
  const result = await deletePriceAlert(laptopId);
  const msg = result.ok ? 'Alerta eliminada.' : result.error ?? 'No se pudo eliminar.';
  redirect('/mis-alertas?message=' + encodeURIComponent(msg));
}
