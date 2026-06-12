/**
 * Conector de Amazon vía Product Advertising API 5.0 (PA-API).
 *
 * Añade Amazon como SEGUNDA fuente de precio + enlace de afiliado para portátiles que YA
 * existen en el catálogo, casándolos por EAN (laptops.ean ↔ PA-API). NO crea productos
 * nuevos: si el EAN no está ya en BD, se ignora.
 *
 * Flujo por portátil:
 *   1. Si ya hay ASIN cacheado en affiliate_links → GetItems(ASIN) directo.
 *      Si no → SearchItems(Keywords=EAN) y se elige el item cuyo EAN coincide; se cachea
 *      el ASIN para la próxima vez (rate limit de PA-API ~1 req/s).
 *   2. Mapea la oferta (lib/amazon/map-item) y hace upsert de affiliate_links + un punto
 *      en prices_history (solo si el precio está en EUR).
 *
 * Uso:
 *   npm run enrich:amazon -- --mock --dry-run        # prueba el pipeline SIN credenciales
 *   npm run enrich:amazon -- --limit 50              # 50 portátiles (requiere credenciales)
 *   npm run enrich:amazon -- --limit 50 --dry-run    # 50 sin escribir
 *
 * Env (de .env.local) — PENDIENTE de cuenta de Amazon Associates aprobada:
 *   AMAZON_ACCESS_KEY      Access Key de PA-API
 *   AMAZON_SECRET_KEY      Secret Key de PA-API
 *   AMAZON_PARTNER_TAG     tag de afiliado (p.ej. mitienda-21)
 *   AMAZON_HOST            (opcional) default webservices.amazon.es
 *   AMAZON_REGION          (opcional) default eu-west-1
 *   AMAZON_MARKETPLACE     (opcional) default www.amazon.es
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Sin las tres credenciales de Amazon solo se puede correr con --mock (datos de ejemplo);
 * --mock fuerza dry-run para no escribir ofertas falsas en producción.
 */

import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

import { configFromEnv, getItemsByAsin, searchItemsByEan, type AmazonConfig } from '@/lib/amazon/client';
import { mapItem, pickItemByEan } from '@/lib/amazon/map-item';
import { mockSearchResponse } from '@/lib/amazon/mock';
import type { PaapiItem } from '@/lib/amazon/types';
import type { Database, TablesInsert } from '@/lib/supabase/database.types';

loadEnv({ path: '.env.local' });

const { values: args } = parseArgs({
  options: {
    limit: { type: 'string', default: '20' },
    'dry-run': { type: 'boolean', default: false },
    mock: { type: 'boolean', default: false },
    delay: { type: 'string', default: '1100' }, // ms entre llamadas (PA-API ~1 req/s)
  },
});

const LIMIT = Number(args.limit);
const MOCK = args.mock;
// --mock fuerza dry-run: nunca escribimos ofertas simuladas en producción.
const DRY_RUN = args['dry-run'] || MOCK;
const DELAY = Number(args.delay);

const RETAILER_SLUG = 'amazon';
const RETAILER_NAME = 'Amazon';
const RETAILER_BASE = 'https://www.amazon.es';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
}
const supabase = createClient<Database>(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type LaptopRow = { id: string; brand: string; model: string; ean: string | null };
type LinkRow = { laptop_id: string; asin: string | null };

async function getOrCreateRetailerId(partnerTag: string | null): Promise<string> {
  const { data } = await supabase.from('retailers').select('id').eq('slug', RETAILER_SLUG).maybeSingle();
  if (data) {
    if (partnerTag) await supabase.from('retailers').update({ affiliate_id: partnerTag }).eq('id', data.id);
    return data.id;
  }
  const payload: TablesInsert<'retailers'> = {
    slug: RETAILER_SLUG,
    name: RETAILER_NAME,
    base_url: RETAILER_BASE,
    affiliate_id: partnerTag,
    active: true,
  };
  const { data: created, error } = await supabase.from('retailers').insert([payload]).select('id').single();
  if (error) throw error;
  return created.id;
}

// Portátiles nuevos (no reacondicionados) con EAN: la clave para casar con Amazon.
async function loadTargets(): Promise<LaptopRow[]> {
  const { data, error } = await supabase
    .from('laptops')
    .select('id, brand, model, ean')
    .not('ean', 'is', null)
    .eq('refurbished', false)
    .limit(LIMIT)
    .returns<LaptopRow[]>();
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ASIN ya cacheado por portátil (enlace de Amazon previo), para usar GetItems directo.
async function loadAsinCache(retailerId: string, laptopIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (laptopIds.length === 0) return out;
  const { data } = await supabase
    .from('affiliate_links')
    .select('laptop_id, asin')
    .eq('retailer_id', retailerId)
    .in('laptop_id', laptopIds)
    .returns<LinkRow[]>();
  for (const r of data ?? []) if (r.asin) out.set(r.laptop_id, r.asin);
  return out;
}

async function resolveItem(
  cfg: AmazonConfig | null,
  laptop: LaptopRow,
  cachedAsin: string | undefined,
): Promise<PaapiItem | null> {
  const ean = laptop.ean!;
  if (MOCK) {
    return pickItemByEan(mockSearchResponse(ean).SearchResult?.Items ?? [], ean);
  }
  if (cachedAsin) {
    const items = await getItemsByAsin(cfg!, [cachedAsin]);
    await sleep(DELAY);
    return items[0] ?? null;
  }
  const items = await searchItemsByEan(cfg!, ean);
  await sleep(DELAY);
  return pickItemByEan(items, ean);
}

async function main(): Promise<void> {
  const cfg = configFromEnv();
  if (!cfg && !MOCK) {
    throw new Error(
      'Faltan credenciales de Amazon (AMAZON_ACCESS_KEY / AMAZON_SECRET_KEY / AMAZON_PARTNER_TAG).\n' +
        'Para probar el pipeline sin cuenta: npm run enrich:amazon -- --mock --dry-run',
    );
  }

  console.log(
    `🛒 Conector Amazon (mock=${MOCK}, dry-run=${DRY_RUN}, limit=${LIMIT})` +
      (cfg ? ` · marketplace ${cfg.marketplace}` : ' · SIN credenciales (mock)'),
  );

  const retailerId = DRY_RUN ? 'dry-run' : await getOrCreateRetailerId(cfg!.partnerTag);

  const targets = await loadTargets();
  console.log(`   ${targets.length} portátil(es) con EAN a consultar.`);
  if (targets.length === 0) return;

  const cache = DRY_RUN
    ? new Map<string, string>()
    : await loadAsinCache(retailerId, targets.map((l) => l.id));

  let ok = 0;
  let priced = 0;
  let noMatch = 0;
  for (const [i, laptop] of targets.entries()) {
    const tag = `[${i + 1}/${targets.length}] ${laptop.brand} ${laptop.model}`;
    if (!laptop.ean) {
      noMatch++;
      continue;
    }
    let item: PaapiItem | null;
    try {
      item = await resolveItem(cfg, laptop, cache.get(laptop.id));
    } catch (e) {
      console.log(`${tag} → error PA-API: ${(e as Error).message.slice(0, 80)}`);
      continue;
    }
    if (!item) {
      noMatch++;
      console.log(`${tag} → sin match en Amazon (EAN ${laptop.ean})`);
      continue;
    }
    const offer = mapItem(item);
    if (!offer) {
      noMatch++;
      continue;
    }
    ok++;
    const priceLabel = offer.priceEur != null ? `${offer.priceEur}€` : 'sin precio EUR';
    console.log(`${tag} → ASIN ${offer.asin} · ${priceLabel}${DRY_RUN ? ' (dry)' : ''}`);

    if (DRY_RUN) {
      if (offer.priceEur != null) priced++;
      continue;
    }

    const link: TablesInsert<'affiliate_links'> = {
      laptop_id: laptop.id,
      retailer_id: retailerId,
      url: offer.url,
      asin: offer.asin,
      active: true,
    };
    const { error: linkErr } = await supabase
      .from('affiliate_links')
      .upsert([link], { onConflict: 'laptop_id,retailer_id' });
    if (linkErr) {
      console.log(`   ✗ affiliate_link: ${linkErr.message}`);
      continue;
    }

    if (offer.priceEur != null) {
      const price: TablesInsert<'prices_history'> = {
        laptop_id: laptop.id,
        retailer_id: retailerId,
        price_eur: offer.priceEur,
        in_stock: offer.inStock,
      };
      const { error: priceErr } = await supabase.from('prices_history').insert([price]);
      if (priceErr) console.log(`   ✗ price: ${priceErr.message}`);
      else priced++;
    }
  }

  console.log(`\n✅ Hecho: ${ok} con oferta, ${priced} con precio, ${noMatch} sin match.`);
}

main().catch((e) => {
  console.error('💥 Error fatal:', e);
  process.exit(1);
});
