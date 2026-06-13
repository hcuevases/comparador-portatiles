// Helpers de BD compartidos por los conectores de retailers externos: alta/obtención del
// retailer y carga de los portátiles candidatos (con EAN, no reacondicionados). Reutilizado
// por enrich-amazon / enrich-mediamarkt / enrich-elcorteingles.

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, TablesInsert } from '@/lib/supabase/database.types';

export type EanTarget = { id: string; brand: string; model: string; ean: string };

export async function getOrCreateRetailer(
  supabase: SupabaseClient<Database>,
  retailer: { slug: string; name: string; baseUrl: string; affiliateId: string | null },
): Promise<string> {
  const { data } = await supabase.from('retailers').select('id').eq('slug', retailer.slug).maybeSingle();
  if (data) {
    if (retailer.affiliateId) {
      await supabase.from('retailers').update({ affiliate_id: retailer.affiliateId }).eq('id', data.id);
    }
    return data.id;
  }
  const payload: TablesInsert<'retailers'> = {
    slug: retailer.slug,
    name: retailer.name,
    base_url: retailer.baseUrl,
    affiliate_id: retailer.affiliateId,
    active: true,
  };
  const { data: created, error } = await supabase.from('retailers').insert([payload]).select('id').single();
  if (error) throw error;
  return created.id;
}

// Portátiles nuevos (no reacondicionados) con EAN: la clave para casar con cualquier fuente
// externa. El reacond. comparte EAN pero es otra entrada/condición, así que se excluye.
export async function loadEanTargets(
  supabase: SupabaseClient<Database>,
  limit: number,
): Promise<EanTarget[]> {
  const { data, error } = await supabase
    .from('laptops')
    .select('id, brand, model, ean')
    .not('ean', 'is', null)
    .eq('refurbished', false)
    .limit(limit)
    .returns<EanTarget[]>();
  if (error) throw new Error(error.message);
  return data ?? [];
}
