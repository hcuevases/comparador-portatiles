// Escritura compartida por los conectores de retailers (Amazon, MediaMarkt, El Corte
// Inglés): dado un portátil ya casado por EAN y la oferta de un retailer, hace upsert del
// enlace de afiliado y, si hay precio en EUR, inserta un punto en el histórico. Centraliza
// la única forma de escribir ofertas para no duplicar la lógica en cada `enrich-*`.

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, TablesInsert } from '@/lib/supabase/database.types';

export type RetailerOffer = {
  url: string; // enlace de afiliado / deeplink ya trackeado
  priceEur: number | null; // null si la oferta no está en EUR o no hay precio
  inStock: boolean | null;
  asin?: string | null; // cache específico de Amazon; null/undefined para el resto
};

export type UpsertResult = {
  priced: boolean;
  linkError: string | null;
  priceError: string | null;
};

/**
 * Upsert del enlace de afiliado (onConflict laptop+retailer) + insert de precio si lo hay.
 * No lanza: devuelve los errores para que el job los registre y siga con el siguiente.
 */
export async function upsertOffer(
  supabase: SupabaseClient<Database>,
  laptopId: string,
  retailerId: string,
  offer: RetailerOffer,
): Promise<UpsertResult> {
  const link: TablesInsert<'affiliate_links'> = {
    laptop_id: laptopId,
    retailer_id: retailerId,
    url: offer.url,
    asin: offer.asin ?? null,
    active: true,
  };
  const { error: linkErr } = await supabase
    .from('affiliate_links')
    .upsert([link], { onConflict: 'laptop_id,retailer_id' });
  if (linkErr) return { priced: false, linkError: linkErr.message, priceError: null };

  if (offer.priceEur == null) return { priced: false, linkError: null, priceError: null };

  const price: TablesInsert<'prices_history'> = {
    laptop_id: laptopId,
    retailer_id: retailerId,
    price_eur: offer.priceEur,
    in_stock: offer.inStock,
  };
  const { error: priceErr } = await supabase.from('prices_history').insert([price]);
  return { priced: !priceErr, linkError: null, priceError: priceErr?.message ?? null };
}
