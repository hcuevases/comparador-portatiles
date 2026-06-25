/**
 * Comprobador de salud de los enlaces de afiliado de PcComponentes (vía Playwright).
 *
 * Por qué Playwright (y no fetch): la ficha está tras Cloudflare (intermitente) y, sobre
 * todo, PcComponentes hace rate-limit AGRESIVO a barridos desde una sola IP (curl en lote
 * devuelve 000 al 100%). Un Chromium real, secuencial y espaciado, con contexto fresco por
 * URL, es lo único fiable — mismo patrón que scripts/enrich-specs.ts. CORRER EN LOCAL, no en
 * GitHub Actions (IP datacenter aún más bloqueada).
 *
 * Escribe affiliate_links.unavailable_at/checked_at/last_status. NO toca url/active.
 *   - 410/404 (o soft-404) → unavailable_at = now()  (sale de la home; ficha degrada)
 *   - 200                   → unavailable_at = null   (revive si volvió)
 *   - reto/timeout/403/5xx  → solo checked_at+last_status (no decide; evita falsos muertos)
 *
 * Uso:
 *   npm run check:links -- --limit 20 --dry-run   # prueba sin escribir
 *   npm run check:links -- --limit 150            # una pasada (destacados/nunca-verif. primero)
 *
 * Env (.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { chromium, type Browser, type Page } from 'playwright';

import { classifyResponse } from '@/lib/link-health';
import type { Database } from '@/lib/supabase/database.types';

loadEnv({ path: '.env.local' });

const { values: args } = parseArgs({
  options: {
    limit: { type: 'string', default: '150' },
    'dry-run': { type: 'boolean', default: false },
    delay: { type: 'string', default: '4000' }, // ms entre URLs (rate-limit de PcComponentes)
  },
});
const LIMIT = Number(args.limit);
const DRY_RUN = args['dry-run'];
const DELAY = Number(args.delay);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
}
const supabase = createClient<Database>(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function probe(page: Page, url: string): Promise<{ status: number; title: string }> {
  let status = 0;
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    status = resp?.status() ?? 0;
  } catch {
    return { status: 0, title: '' };
  }
  // Si hay reto de Cloudflare, dale unos segundos para autorresolverse antes de leer el título.
  await page
    .waitForFunction(() => !/un momento|just a moment|verifying you are human|attention required/i.test(document.title || ''), {
      timeout: 12000,
    })
    .catch(() => {});
  const title = await page.title().catch(() => '');
  return { status, title };
}

async function main() {
  const { data: targets, error } = await supabase.rpc('affiliate_links_to_check', { p_limit: LIMIT });
  if (error) throw new Error(`RPC affiliate_links_to_check: ${error.message}`);
  const links = targets ?? [];
  console.log(`Comprobando ${links.length} enlaces (limit=${LIMIT}, dry-run=${DRY_RUN})\n`);

  let browser: Browser = await chromium.launch({ headless: true });
  let dead = 0;
  let alive = 0;
  let inconclusive = 0;

  for (const [i, link] of links.entries()) {
    // Reciclar el navegador cada 50 para soltar memoria/estado (igual que enrich-specs).
    if (i > 0 && i % 50 === 0) {
      await browser.close();
      browser = await chromium.launch({ headless: true });
    }
    const ctx = await browser.newContext({ locale: 'es-ES', userAgent: UA });
    const page = await ctx.newPage();
    let status = 0;
    let title = '';
    try {
      ({ status, title } = await probe(page, link.url));
    } finally {
      await ctx.close();
    }

    const health = classifyResponse(status, title);
    const now = new Date().toISOString();
    let mark = '?';
    let update: Database['public']['Tables']['affiliate_links']['Update'];
    if (health === 'dead') {
      mark = '✗';
      dead++;
      update = { unavailable_at: now, checked_at: now, last_status: status };
    } else if (health === 'alive') {
      mark = '✓';
      alive++;
      update = { unavailable_at: null, checked_at: now, last_status: status };
    } else {
      inconclusive++;
      update = { checked_at: now, last_status: status };
    }

    if (!DRY_RUN) {
      const { error: upErr } = await supabase.from('affiliate_links').update(update).eq('id', link.id);
      if (upErr) console.log(`   ✗ update (${health}): ${upErr.message}`);
    }

    console.log(`${mark} [${status || '---'}] ${link.url}`);
    if (i < links.length - 1) await sleep(DELAY);
  }

  await browser.close();
  console.log(`\nResumen: ${alive} vivos · ${dead} muertos · ${inconclusive} inconclusos`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
