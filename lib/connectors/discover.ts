// Descubrimiento: crear laptops nuevos a partir de los productos de un retailer externo
// (Awin/Tradedoubler) cuyo EAN NO está ya en el catálogo, para poblar la web con portátiles
// que no están en PcComponentes. Si el EAN ya existe, solo adjunta la oferta.
//
// Las funciones de parseo son puras y testeables (ver discover.test.ts); el feed trae
// nombre/marca/categoría con formato variable e impredecible hasta ver el feed real, así
// que el parseo es heurístico y conservador (ante la duda, NO crea).

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, TablesInsert } from '@/lib/supabase/database.types';

import { upsertOffer, type RetailerOffer } from './upsert-offer';

const LAPTOP_RE = /port[áa]til|laptop|notebook|ordenador\s*port|cuaderno|macbook/i;
// Accesorios y otras categorías que NO son un portátil aunque mencionen "portátil".
const NON_LAPTOP_RE =
  /funda|malet[íi]n|mochila|cargador|adaptador|soporte|base\s|refriger|accesori|rat[óo]n|teclado|monitor|sobremesa|tablet|m[óo]vil|smartphone|disco\s|ssd\s|memoria|webcam|altavoz|auricular/i;

/** ¿La categoría/nombre indican un portátil y no un accesorio? Conservador. */
export function isLaptopProduct(category: string | null | undefined, name: string | null | undefined): boolean {
  const hay = `${category ?? ''} ${name ?? ''}`;
  if (NON_LAPTOP_RE.test(hay)) return false;
  return LAPTOP_RE.test(hay);
}

const KNOWN_BRANDS = [
  'Acer', 'Apple', 'Asus', 'Dell', 'Dynabook', 'Gigabyte', 'HP', 'Honor', 'Huawei',
  'Lenovo', 'LG', 'Medion', 'Microsoft', 'MSI', 'Primux', 'Razer', 'Samsung', 'Toshiba', 'Vant',
];

/**
 * Marca + modelo desde el nombre del feed. Usa el campo `brand` si viene; si no, busca una
 * marca conocida en el nombre; como último recurso, la primera palabra. Devuelve null si el
 * nombre queda vacío.
 */
export function parseBrandModel(name: string, brandField?: string | null): { brand: string; model: string } | null {
  const clean = name.replace(/^Port[áa]til\s+/i, '').replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  let brand = (brandField ?? '').trim();
  if (!brand) {
    brand = KNOWN_BRANDS.find((b) => new RegExp(`\\b${b}\\b`, 'i').test(clean)) ?? clean.split(' ')[0];
  }
  const model = clean.toLowerCase().startsWith(brand.toLowerCase()) ? clean.slice(brand.length).trim() : clean;
  return { brand, model: model || clean };
}

/** Slug URL-safe con sufijo de EAN para garantizar unicidad entre fuentes. */
export function makeSlug(brand: string, model: string, ean: string): string {
  const base = `${brand}-${model}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return `${base}-${ean.slice(-6)}`;
}

export type DiscoveredProduct = {
  ean: string;
  name: string;
  brand?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  offer: RetailerOffer;
};

export type DiscoverResult = 'created' | 'attached' | 'skipped';

/**
 * Si el EAN ya existe (no reacondicionado) → adjunta la oferta. Si no y parece un portátil →
 * crea el laptop (specs vacías; se enriquecen aparte) y adjunta. Si no parece portátil o no
 * se puede parsear → skip (preferimos no crear basura).
 */
export async function discoverOrAttach(
  supabase: SupabaseClient<Database>,
  retailerId: string,
  p: DiscoveredProduct,
  opts: { dryRun?: boolean } = {},
): Promise<DiscoverResult> {
  const { data: existing } = await supabase
    .from('laptops')
    .select('id')
    .eq('ean', p.ean)
    .eq('refurbished', false)
    .maybeSingle();
  if (existing) {
    if (!opts.dryRun) await upsertOffer(supabase, existing.id, retailerId, p.offer);
    return 'attached';
  }

  if (!isLaptopProduct(p.category, p.name)) return 'skipped';
  const bm = parseBrandModel(p.name, p.brand);
  if (!bm) return 'skipped';
  if (opts.dryRun) return 'created';

  const laptop: TablesInsert<'laptops'> = {
    slug: makeSlug(bm.brand, bm.model, p.ean),
    brand: bm.brand,
    model: bm.model,
    ean: p.ean,
    image_url: p.imageUrl ?? null,
    refurbished: false,
  };
  const { data: created, error } = await supabase
    .from('laptops')
    .upsert([laptop], { onConflict: 'slug' })
    .select('id')
    .single();
  if (error || !created) return 'skipped';

  await upsertOffer(supabase, created.id, retailerId, p.offer);
  return 'created';
}
