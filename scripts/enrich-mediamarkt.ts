/**
 * Conector de MediaMarkt vía la Products API de Tradedoubler.
 *
 * Añade MediaMarkt como fuente de precio + enlace de afiliado para portátiles existentes,
 * casándolos por EAN (consulta `;ean=` en tiempo real). No crea productos.
 *
 * Dos modos:
 *   - por defecto: adjunta ofertas a portátiles YA existentes (cruce por EAN).
 *   - --discover: enumera el feed por keyword y CREA laptops nuevos cuyo EAN no esté en
 *     catálogo → puebla la web con productos que no están en otras fuentes.
 *
 * Uso:
 *   npm run enrich:mediamarkt -- --mock --dry-run                  # prueba SIN credenciales
 *   npm run enrich:mediamarkt -- --mock --dry-run --discover       # prueba descubrimiento
 *   npm run enrich:mediamarkt -- --limit 50                        # requiere credenciales
 *   npm run enrich:mediamarkt -- --limit 50 --dry-run
 *   npm run enrich:mediamarkt -- --discover --limit 5000           # poblar (requiere cuenta)
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
import { discoverOrAttach } from '@/lib/connectors/discover';
import { upsertOffer } from '@/lib/connectors/upsert-offer';
import { configFromEnv, searchProductsByEan, enumerateLaptops } from '@/lib/tradedoubler/client';
import { mapProduct, pickByEan, toDiscovered } from '@/lib/tradedoubler/map-product';
import { mockProductsResponse, mockEnumerateResponse } from '@/lib/tradedoubler/mock';
import type { TdProduct } from '@/lib/tradedoubler/types';
import type { Database } from '@/lib/supabase/database.types';

loadEnv({ path: '.env.local' });

const { values: args } = parseArgs({
  options: {
    limit: { type: 'string', default: '20' },
    'dry-run': { type: 'boolean', default: false },
    mock: { type: 'boolean', default: false },
    delay: { type: 'string', default: '1100' },
    // Descubrimiento: enumera el feed por keyword y CREA laptops cuyo EAN no esté en
    // catálogo. Sin él, solo adjunta ofertas a los ya existentes (cruce por EAN).
    discover: { type: 'boolean', default: false },
  },
});

const LIMIT = Number(args.limit);
const MOCK = args.mock;
const DRY_RUN = args['dry-run'] || MOCK; // --mock nunca escribe ofertas simuladas
const DELAY = Number(args.delay);
const DISCOVER = args.discover;

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

  console.log(`🛒 Conector MediaMarkt (mock=${MOCK}, dry-run=${DRY_RUN}, discover=${DISCOVER}, limit=${LIMIT})`);

  const retailerId = DRY_RUN
    ? 'dry-run'
    : await getOrCreateRetailer(supabase, {
        slug: 'mediamarkt',
        name: 'MediaMarkt',
        baseUrl: 'https://www.mediamarkt.es',
        affiliateId: cfg!.feedId,
      });

  if (DISCOVER) {
    // Enumera el feed (real o mock) por keyword, dedup por EAN, y crea/adjunta.
    // OJO: la decisión crear-vs-adjuntar la toma discoverOrAttach consultando la BD por
    // EAN, no la lista de abajo. `existingEans` solo siembra el feed MOCK con unos EANs
    // reales (para ejercitar "attached"); en real no se usa, por eso va dentro del branch.
    const dummyCfg = cfg ?? { token: 'mock', feedId: 'mock' };
    const existingEans = MOCK ? (await loadEanTargets(supabase, 3)).map((t) => t.ean) : [];
    const products = await enumerateLaptops(dummyCfg, {
      delayMs: MOCK ? 0 : DELAY,
      ...(MOCK
        ? {
            fetchPage: (_c, kw, page, size) =>
              Promise.resolve(mockEnumerateResponse(kw, page, size, existingEans)),
          }
        : {}),
    });
    console.log(`   feed enumerado: ${products.length} producto(s) únicos.`);

    let created = 0;
    let attached = 0;
    let skipped = 0;
    for (const p of products.slice(0, LIMIT)) {
      const d = toDiscovered(p);
      if (!d) {
        skipped++;
        continue;
      }
      const res = await discoverOrAttach(supabase, retailerId, d, { dryRun: DRY_RUN });
      if (res === 'created') {
        created++;
        console.log(`  + crear: ${d.brand ?? ''} ${d.name || d.ean}${DRY_RUN ? ' (dry)' : ''}`);
      } else if (res === 'attached') {
        attached++;
      } else {
        skipped++;
      }
    }
    console.log(
      `\n✅ Descubrimiento: ${created} creados, ${attached} adjuntados (ya en catálogo), ${skipped} saltados (no portátil o sin datos).`,
    );
    return;
  }

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
