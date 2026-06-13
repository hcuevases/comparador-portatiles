/**
 * Conector de El Corte Inglés vía feed de producto de Awin.
 *
 * A diferencia de Amazon/MediaMarkt (query por EAN), Awin entrega un feed COMPLETO: se
 * descarga una vez y se cruza por EAN. Dos modos:
 *   - por defecto: adjunta ofertas a portátiles YA existentes (cruce por EAN).
 *   - --discover: recorre todo el feed y CREA laptops nuevos cuyo EAN no esté en catálogo
 *     (categoría portátil) → puebla la web con productos que no están en PcComponentes.
 *
 * Uso:
 *   npm run enrich:elcorteingles -- --mock --dry-run             # prueba SIN credenciales
 *   npm run enrich:elcorteingles -- --mock --dry-run --discover  # prueba descubrimiento
 *   npm run enrich:elcorteingles -- --limit 200                  # requiere credenciales
 *   npm run enrich:elcorteingles -- --discover --limit 5000      # poblar (requiere cuenta)
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
import { discoverOrAttach } from '@/lib/connectors/discover';
import { upsertOffer } from '@/lib/connectors/upsert-offer';
import type { Database } from '@/lib/supabase/database.types';

loadEnv({ path: '.env.local' });

const { values: args } = parseArgs({
  options: {
    limit: { type: 'string', default: '50' },
    'dry-run': { type: 'boolean', default: false },
    mock: { type: 'boolean', default: false },
    // Descubrimiento: recorre TODO el feed y CREA laptops cuyo EAN no esté en catálogo
    // (categoría portátil). Sin él, solo adjunta ofertas a los ya existentes.
    discover: { type: 'boolean', default: false },
  },
});

const LIMIT = Number(args.limit);
const MOCK = args.mock;
const DRY_RUN = args['dry-run'] || MOCK; // --mock nunca escribe ofertas simuladas
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
      'Faltan credenciales de Awin (AWIN_API_KEY / AWIN_FEED_ID).\n' +
        'Para probar sin cuenta: npm run enrich:elcorteingles -- --mock --dry-run',
    );
  }

  console.log(
    `🛒 Conector El Corte Inglés (mock=${MOCK}, dry-run=${DRY_RUN}, discover=${DISCOVER}, limit=${LIMIT})`,
  );

  const retailerId = DRY_RUN
    ? 'dry-run'
    : await getOrCreateRetailer(supabase, {
        slug: 'elcorteingles',
        name: 'El Corte Inglés',
        baseUrl: 'https://www.elcorteingles.es',
        affiliateId: cfg!.feedId,
      });

  // El feed mock se genera a partir de los EAN del catálogo (+ unos productos nuevos para
  // ejercitar el descubrimiento); el real se descarga entero.
  const targets = await loadEanTargets(supabase, LIMIT);
  const csv = MOCK ? mockFeedCsv(targets.map((t) => t.ean)) : await downloadFeed(cfg!);
  const rows = parseAwinFeed(csv);
  console.log(`   feed: ${rows.length} fila(s).`);

  if (DISCOVER) {
    // Recorre el feed: crea laptops nuevos (EAN no en catálogo) o adjunta ofertas a los ya
    // existentes. Conservador: solo crea lo que parece portátil.
    let created = 0;
    let attached = 0;
    let skipped = 0;
    for (const row of rows.slice(0, LIMIT)) {
      const res = await discoverOrAttach(
        supabase,
        retailerId,
        {
          ean: row.ean,
          name: row.name ?? '',
          brand: row.brand,
          category: row.category,
          imageUrl: row.imageUrl,
          offer: { url: row.url, priceEur: row.priceEur, inStock: row.inStock },
        },
        { dryRun: DRY_RUN },
      );
      if (res === 'created') {
        created++;
        console.log(`  + crear: ${row.brand ?? ''} ${row.name ?? row.ean}${DRY_RUN ? ' (dry)' : ''}`);
      } else if (res === 'attached') {
        attached++;
      } else {
        skipped++;
      }
    }
    console.log(
      `\n✅ Descubrimiento: ${created} creados, ${attached} adjuntados (ya en catálogo), ${skipped} saltados (no portátil).`,
    );
    return;
  }

  // Modo por defecto: solo adjuntar ofertas a los portátiles ya existentes (cruce por EAN).
  const feed = indexByEan(rows);
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
