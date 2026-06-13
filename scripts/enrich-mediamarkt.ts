/**
 * Conector de MediaMarkt vía la Products API de Tradedoubler.
 *
 * Añade MediaMarkt como fuente de precio + enlace de afiliado para portátiles existentes,
 * casándolos por EAN (consulta `;ean=` en tiempo real). No crea productos.
 *
 * Uso:
 *   npm run enrich:mediamarkt -- --mock --dry-run        # prueba SIN credenciales
 *   npm run enrich:mediamarkt -- --limit 50              # requiere credenciales
 *   npm run enrich:mediamarkt -- --limit 50 --dry-run
 *
 * Env (de .env.local) — PENDIENTE de alta como publisher en Tradedoubler + aprobación de
 * MediaMarkt (ver ADR-008; la existencia del feed de producto NO está confirmada):
 *   TRADEDOUBLER_TOKEN     token de 40 hex (Account → Manage tokens → PRODUCTS)
 *   TRADEDOUBLER_FEED_ID   id del feed de producto de MediaMarkt (fid)
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Sin credenciales solo corre con --mock; --mock fuerza dry-run.
 */

import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

import { getOrCreateRetailer, loadEanTargets } from '@/lib/connectors/db';
import { upsertOffer } from '@/lib/connectors/upsert-offer';
import { configFromEnv, searchProductsByEan } from '@/lib/tradedoubler/client';
import { mapProduct, pickByEan } from '@/lib/tradedoubler/map-product';
import { mockProductsResponse } from '@/lib/tradedoubler/mock';
import type { TdProduct } from '@/lib/tradedoubler/types';
import type { Database } from '@/lib/supabase/database.types';

loadEnv({ path: '.env.local' });

const { values: args } = parseArgs({
  options: {
    limit: { type: 'string', default: '20' },
    'dry-run': { type: 'boolean', default: false },
    mock: { type: 'boolean', default: false },
    delay: { type: 'string', default: '1100' },
  },
});

const LIMIT = Number(args.limit);
const MOCK = args.mock;
const DRY_RUN = args['dry-run'] || MOCK; // --mock nunca escribe ofertas simuladas
const DELAY = Number(args.delay);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
}
const supabase = createClient<Database>(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main(): Promise<void> {
  const cfg = configFromEnv();
  if (!cfg && !MOCK) {
    throw new Error(
      'Faltan credenciales de Tradedoubler (TRADEDOUBLER_TOKEN / TRADEDOUBLER_FEED_ID).\n' +
        'Para probar sin cuenta: npm run enrich:mediamarkt -- --mock --dry-run',
    );
  }

  console.log(`🛒 Conector MediaMarkt (mock=${MOCK}, dry-run=${DRY_RUN}, limit=${LIMIT})`);

  const retailerId = DRY_RUN
    ? 'dry-run'
    : await getOrCreateRetailer(supabase, {
        slug: 'mediamarkt',
        name: 'MediaMarkt',
        baseUrl: 'https://www.mediamarkt.es',
        affiliateId: cfg!.feedId,
      });

  const targets = await loadEanTargets(supabase, LIMIT);
  console.log(`   ${targets.length} portátil(es) con EAN a consultar.`);
  if (targets.length === 0) return;

  let ok = 0;
  let priced = 0;
  let noMatch = 0;
  for (const [i, laptop] of targets.entries()) {
    const tag = `[${i + 1}/${targets.length}] ${laptop.brand} ${laptop.model}`;
    let products: TdProduct[];
    try {
      if (MOCK) {
        products = mockProductsResponse(laptop.ean).products ?? [];
      } else {
        products = await searchProductsByEan(cfg!, laptop.ean);
        await sleep(DELAY);
      }
    } catch (e) {
      console.log(`${tag} → error Tradedoubler: ${(e as Error).message.slice(0, 80)}`);
      continue;
    }

    const product = pickByEan(products, laptop.ean);
    const offer = product && mapProduct(product);
    if (!offer) {
      noMatch++;
      console.log(`${tag} → sin match en MediaMarkt (EAN ${laptop.ean})`);
      continue;
    }
    ok++;
    const priceLabel = offer.priceEur != null ? `${offer.priceEur}€` : 'sin precio EUR';
    console.log(`${tag} → ${priceLabel}${DRY_RUN ? ' (dry)' : ''}`);

    if (DRY_RUN) {
      if (offer.priceEur != null) priced++;
      continue;
    }

    const r = await upsertOffer(supabase, laptop.id, retailerId, offer);
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
