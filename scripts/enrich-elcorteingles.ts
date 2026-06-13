/**
 * Conector de El Corte Inglés vía feed de producto de Awin.
 *
 * A diferencia de Amazon/MediaMarkt (query por EAN), Awin entrega un feed COMPLETO: se
 * descarga una vez, se indexa por EAN y se cruzan los portátiles del catálogo. Añade ECI
 * como fuente de precio + enlace de afiliado para portátiles existentes. No crea productos.
 *
 * Uso:
 *   npm run enrich:elcorteingles -- --mock --dry-run     # prueba SIN credenciales
 *   npm run enrich:elcorteingles -- --limit 200          # requiere credenciales
 *   npm run enrich:elcorteingles -- --limit 200 --dry-run
 *
 * Env (de .env.local) — PENDIENTE de alta como publisher en Awin + aprobación de El Corte
 * Inglés (ver ADR-008; la existencia del feed NO está confirmada):
 *   AWIN_API_KEY     API key de publisher (productdata.awin.com)
 *   AWIN_FEED_ID     id del feed de producto de El Corte Inglés (fid)
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Sin credenciales solo corre con --mock; --mock fuerza dry-run.
 */

import { parseArgs } from 'node:util';

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

import { configFromEnv, downloadFeed } from '@/lib/awin/client';
import { indexByEan, parseAwinFeed } from '@/lib/awin/parse-feed';
import { mockFeedCsv } from '@/lib/awin/mock';
import { getOrCreateRetailer, loadEanTargets } from '@/lib/connectors/db';
import { upsertOffer } from '@/lib/connectors/upsert-offer';
import type { Database } from '@/lib/supabase/database.types';

loadEnv({ path: '.env.local' });

const { values: args } = parseArgs({
  options: {
    limit: { type: 'string', default: '50' },
    'dry-run': { type: 'boolean', default: false },
    mock: { type: 'boolean', default: false },
  },
});

const LIMIT = Number(args.limit);
const MOCK = args.mock;
const DRY_RUN = args['dry-run'] || MOCK; // --mock nunca escribe ofertas simuladas

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
      'Faltan credenciales de Awin (AWIN_API_KEY / AWIN_FEED_ID).\n' +
        'Para probar sin cuenta: npm run enrich:elcorteingles -- --mock --dry-run',
    );
  }

  console.log(`🛒 Conector El Corte Inglés (mock=${MOCK}, dry-run=${DRY_RUN}, limit=${LIMIT})`);

  const targets = await loadEanTargets(supabase, LIMIT);
  console.log(`   ${targets.length} portátil(es) con EAN en el catálogo.`);
  if (targets.length === 0) return;

  // Construir el índice ean → oferta del feed (real o simulado a partir de los EAN objetivo).
  const csv = MOCK ? mockFeedCsv(targets.map((t) => t.ean)) : await downloadFeed(cfg!);
  const feed = indexByEan(parseAwinFeed(csv));
  console.log(`   feed: ${feed.size} producto(s) con EAN.`);

  const retailerId = DRY_RUN
    ? 'dry-run'
    : await getOrCreateRetailer(supabase, {
        slug: 'elcorteingles',
        name: 'El Corte Inglés',
        baseUrl: 'https://www.elcorteingles.es',
        affiliateId: cfg!.feedId,
      });

  let ok = 0;
  let priced = 0;
  let noMatch = 0;
  for (const laptop of targets) {
    const row = feed.get(laptop.ean);
    if (!row) {
      noMatch++;
      continue;
    }
    ok++;
    const priceLabel = row.priceEur != null ? `${row.priceEur}€` : 'sin precio EUR';
    console.log(`  ${laptop.brand} ${laptop.model} → ${priceLabel}${DRY_RUN ? ' (dry)' : ''}`);

    if (DRY_RUN) {
      if (row.priceEur != null) priced++;
      continue;
    }

    const r = await upsertOffer(supabase, laptop.id, retailerId, {
      url: row.url,
      priceEur: row.priceEur,
      inStock: row.inStock,
    });
    if (r.linkError) console.log(`   ✗ affiliate_link: ${r.linkError}`);
    else if (r.priceError) console.log(`   ✗ price: ${r.priceError}`);
    else if (r.priced) priced++;
  }

  console.log(`\n✅ Hecho: ${ok} con oferta, ${priced} con precio, ${noMatch} sin match en el feed.`);
}

main().catch((e) => {
  console.error('💥 Error fatal:', e);
  process.exit(1);
});
