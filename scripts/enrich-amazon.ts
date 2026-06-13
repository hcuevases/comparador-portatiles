/**
 * Conector de Amazon vía Product Advertising API 5.0 (PA-API).
 *
 * Añade Amazon como fuente de precio + enlace de afiliado para portátiles que YA existen en
 * el catálogo, casándolos por EAN (laptops.ean ↔ PA-API). NO crea productos: si el EAN no
 * está ya en BD, se ignora.
 *
 * Flujo por portátil:
 *   1. Si ya hay ASIN cacheado en affiliate_links → GetItems(ASIN) directo.
 *      Si no → SearchItems(Keywords=EAN) y se elige el item cuyo EAN coincide; se cachea el
 *      ASIN para la próxima vez (rate limit de PA-API ~1 req/s).
 *   2. Mapea la oferta (lib/amazon/map-item) y escribe vía upsertOffer (compartido).
 *
 * Uso:
 *   npm run enrich:amazon -- --mock --dry-run        # prueba el pipeline SIN credenciales
 *   npm run enrich:amazon -- --limit 50              # 50 portátiles (requiere credenciales)
 *   npm run enrich:amazon -- --limit 50 --dry-run    # 50 sin escribir
 *
 * Env (de .env.local) — PENDIENTE de cuenta de Amazon Associates aprobada:
 *   AMAZON_ACCESS_KEY, AMAZON_SECRET_KEY, AMAZON_PARTNER_TAG
 *   AMAZON_HOST (opc. webservices.amazon.es), AMAZON_REGION (opc. eu-west-1),
 *   AMAZON_MARKETPLACE (opc. www.amazon.es)
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Sin credenciales solo corre con --mock; --mock fuerza dry-run.
 */

import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

import { configFromEnv, getItemsByAsin, searchItemsByEan, type AmazonConfig } from '@/lib/amazon/client';
import { mapItem, pickItemByEan } from '@/lib/amazon/map-item';
import { mockSearchResponse } from '@/lib/amazon/mock';
import type { PaapiItem } from '@/lib/amazon/types';
import { getOrCreateRetailer, loadEanTargets, type EanTarget } from '@/lib/connectors/db';
import { upsertOffer } from '@/lib/connectors/upsert-offer';
import type { Database } from '@/lib/supabase/database.types';

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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
}
const supabase = createClient<Database>(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type LinkRow = { laptop_id: string; asin: string | null };

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
  laptop: EanTarget,
  cachedAsin: string | undefined,
): Promise<PaapiItem | null> {
  if (MOCK) {
    return pickItemByEan(mockSearchResponse(laptop.ean).SearchResult?.Items ?? [], laptop.ean);
  }
  if (cachedAsin) {
    const items = await getItemsByAsin(cfg!, [cachedAsin]);
    await sleep(DELAY);
    return items[0] ?? null;
  }
  const items = await searchItemsByEan(cfg!, laptop.ean);
  await sleep(DELAY);
  return pickItemByEan(items, laptop.ean);
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

  const retailerId = DRY_RUN
    ? 'dry-run'
    : await getOrCreateRetailer(supabase, {
        slug: 'amazon',
        name: 'Amazon',
        baseUrl: 'https://www.amazon.es',
        affiliateId: cfg!.partnerTag,
      });

  const targets = await loadEanTargets(supabase, LIMIT);
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

    const r = await upsertOffer(supabase, laptop.id, retailerId, {
      url: offer.url,
      priceEur: offer.priceEur,
      inStock: offer.inStock,
      asin: offer.asin,
    });
    if (r.linkError) console.log(`   ✗ affiliate_link: ${r.linkError}`);
    else if (r.priceError) console.log(`   ✗ price: ${r.priceError}`);
    else if (r.priced) priced++;
  }

  console.log(`\n✅ Hecho: ${ok} con oferta, ${priced} con precio, ${noMatch} sin match.`);
}

main().catch((e) => {
  console.error('💥 Error fatal:', e);
  process.exit(1);
});
