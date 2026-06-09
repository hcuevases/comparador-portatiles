/**
 * Enriquecimiento de specs desde la ficha HTML de PcComponentes (vía Playwright).
 *
 * Rellena las 6 columnas que Algolia NO expone y que por tanto están a 0%:
 *   cpu_cores, gpu_vram_gb, screen_refresh_hz, weight_kg, battery_wh, ports.
 *
 * Por qué Playwright (y no fetch, como el resto del scraper): la ficha de producto
 * está tras Cloudflare — un `fetch` plano devuelve 403. Un Chromium real pasa el
 * challenge. Decisión y alternativas en ADR-003. La sección "Características" es una
 * tabla de pares etiqueta→valor REDACTADA POR EL VENDEDOR, así que las etiquetas no
 * están normalizadas (p.ej. el peso aparece como "Peso" o dentro de "Dimensiones y
 * peso"; la batería como "55 Wh" o como "7,7V / 6000 mAh"). El parser es difuso en
 * etiquetas + regex en valores, y asume COBERTURA PARCIAL (muchos productos no listan
 * núcleos o tasa de refresco). Solo escribe los campos que consigue parsear.
 *
 * Uso (correr en local o en el cron; NUNCA desde un sandbox que bloquee Cloudflare):
 *   npm run enrich:specs -- --limit 5 --dry-run         # prueba sin escribir
 *   npm run enrich:specs -- --limit 50                  # procesa 50 sin specs
 *   npm run enrich:specs -- <slug> --dry-run            # un slug concreto
 *
 * Variables de entorno (de .env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { chromium, type Browser, type Page } from 'playwright';

import type { Database } from '@/lib/supabase/database.types';

loadEnv({ path: '.env.local' });

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    limit: { type: 'string', default: '20' },
    'dry-run': { type: 'boolean', default: false },
    delay: { type: 'string', default: '1500' }, // ms entre fichas
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

const BASE = 'https://www.pccomponentes.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

type Parsed = {
  cpu_cores: number | null;
  gpu_vram_gb: number | null;
  screen_refresh_hz: number | null;
  weight_kg: number | null;
  battery_wh: number | null;
  ports: string[] | null;
};

// ─── Parsers (difusos en etiqueta, regex en valor) ──────────────────────────

function findRow(map: Record<string, string>, re: RegExp): string | null {
  for (const [k, v] of Object.entries(map)) if (re.test(k)) return v;
  return null;
}

function toFloat(s: string): number {
  return parseFloat(s.replace(',', '.'));
}

function parseCores(map: Record<string, string>): number | null {
  for (const v of Object.values(map)) {
    const m = v.match(/(\d+)\s*n[úu]cleos/i);
    if (m) return Number(m[1]);
  }
  return null;
}

function parseVram(map: Record<string, string>): number | null {
  const g = findRow(map, /gr[áa]fica|gpu|tarjeta\s*gr/i);
  if (!g) return null;
  // GPU dedicada → "… RTX 5070 … 8 GB …". Integrada sin GB → null.
  const m = g.match(/(\d+)\s*GB/i);
  return m ? Number(m[1]) : null;
}

function parseRefresh(map: Record<string, string>): number | null {
  const p = findRow(map, /pantalla|panel|display/i) ?? '';
  const m = p.match(/(\d{2,3})\s*Hz/i);
  return m ? Number(m[1]) : null;
}

function parseWeight(map: Record<string, string>): number | null {
  const w = findRow(map, /\bpeso\b|dimensiones/i) ?? '';
  // primer "X kg" (suele ser el neto; el bruto va después)
  const m = w.match(/(\d+(?:[.,]\d+)?)\s*kg/i);
  if (!m) return null;
  const kg = toFloat(m[1]);
  return kg > 0 && kg < 10 ? kg : null; // descarta basura
}

function parseBattery(map: Record<string, string>): number | null {
  const b = findRow(map, /bater[íi]a/i) ?? '';
  const wh = b.match(/(\d+(?:[.,]\d+)?)\s*Wh/i);
  if (wh) return toFloat(wh[1]);
  // sin Wh directo: calcular de V × Ah
  const v = b.match(/(\d+(?:[.,]\d+)?)\s*V\b/i);
  const mah = b.match(/(\d+(?:[.,]\d+)?)\s*mAh/i);
  if (v && mah) return Math.round(((toFloat(v[1]) * toFloat(mah[1])) / 1000) * 10) / 10;
  return null;
}

const PORT_TOKEN = /usb|hdmi|displayport|thunderbolt|jack|combo\s*audio|rj-?45|ethernet|micro\s*sd|\bsd\b|kensington|vga|type-c|lan|mini-?dp/i;

function parsePorts(map: Record<string, string>): string[] | null {
  // Preferimos una fila "Puertos"/"Conexiones"; si no, sacamos tokens de puerto de
  // "Conectividad" (que mezcla Wi-Fi/Bluetooth, los descartamos por vocabulario).
  const raw = findRow(map, /puertos|conexiones/i) ?? findRow(map, /conectividad/i);
  if (!raw) return null;
  const parts = raw
    .split(/[,;·\n]|\s\+\s/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((p) => PORT_TOKEN.test(p));
  return parts.length ? parts.slice(0, 20) : null;
}

function parseSpecs(map: Record<string, string>): Parsed {
  return {
    cpu_cores: parseCores(map),
    gpu_vram_gb: parseVram(map),
    screen_refresh_hz: parseRefresh(map),
    weight_kg: parseWeight(map),
    battery_wh: parseBattery(map),
    ports: parsePorts(map),
  };
}

// ─── Extracción de la tabla de la ficha ─────────────────────────────────────

type ExtractResult =
  | { kind: 'ok'; table: Record<string, string> }
  | { kind: '404' }
  | { kind: 'wall' };

async function extractTable(page: Page, url: string): Promise<ExtractResult> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // La ficha es una SPA tras Cloudflare. Dos esperas en una: (a) que pase el reto de
  // Cloudflare —su interstitial "Un momento…"/"Just a moment…" se autorresuelve en
  // unos segundos ejecutando su JS, y deja la cookie cf_clearance reutilizable en el
  // contexto—; (b) que el JS pinte la tabla de specs. Resolvemos cuando hay tabla
  // ('ok') o es un 404 ('404'); seguimos esperando mientras siga el reto.
  const status = await page
    .waitForFunction(
      () => {
        const t = document.title || '';
        if (/p[áa]gina no encontrada/i.test(t)) return '404';
        if (/un momento|just a moment|verifying you are human|attention required/i.test(t)) {
          return false; // seguimos en el reto de Cloudflare
        }
        const has = [...document.querySelectorAll('td, th')].some((c) =>
          /procesador|memoria\s*ram|almacenamiento|bater[íi]a/i.test(
            (c as HTMLElement).textContent || '',
          ),
        );
        return has ? 'ok' : false;
      },
      { timeout: 30000 },
    )
    .then((h) => h.jsonValue() as Promise<string>)
    .catch(() => null);

  if (status === '404') return { kind: '404' };

  const title = await page.title();
  if (/un momento|just a moment|verifying you are human|attention required/i.test(title)) {
    return { kind: 'wall' };
  }

  const table = await page.evaluate(() => {
    const out: Record<string, string> = {};
    document.querySelectorAll('tr').forEach((tr) => {
      const cells = tr.querySelectorAll('td, th');
      if (cells.length >= 2) {
        const label = ((cells[0] as HTMLElement).innerText || '').trim();
        const value = ((cells[1] as HTMLElement).innerText || '').trim();
        if (label && value && label.length < 60 && !/^especificaci/i.test(label)) {
          out[label] = value;
        }
      }
    });
    return out;
  });
  return { kind: 'ok', table };
}

// ─── Main ───────────────────────────────────────────────────────────────────

type LaptopRow = { id: string; slug: string };

async function loadTargets(): Promise<LaptopRow[]> {
  if (positionals.length > 0) {
    // Slugs concretos pasados por CLI.
    const { data } = await supabase
      .from('laptops')
      .select('id, slug')
      .in('slug', positionals)
      .returns<LaptopRow[]>();
    return data ?? [];
  }
  // Portátiles cuya specs aún no tiene los 6 campos (al menos cpu_cores null).
  const { data } = await supabase
    .from('specs')
    .select('laptop_id, laptops!inner(id, slug)')
    .is('cpu_cores', null)
    .limit(LIMIT)
    .returns<{ laptops: LaptopRow }[]>();
  return (data ?? []).map((r) => r.laptops);
}

function hasAny(p: Parsed): boolean {
  return (
    p.cpu_cores != null ||
    p.gpu_vram_gb != null ||
    p.screen_refresh_hz != null ||
    p.weight_kg != null ||
    p.battery_wh != null ||
    (p.ports != null && p.ports.length > 0)
  );
}

async function main(): Promise<void> {
  const targets = await loadTargets();
  console.log(
    `Enriquecer ${targets.length} ficha(s)${DRY_RUN ? ' (DRY RUN, no escribe)' : ''}. delay ${DELAY}ms.`,
  );
  if (targets.length === 0) return;

  // headless pasa el reto de Cloudflare en una sesión nueva. NO bloqueamos recursos
  // (imágenes/JS): el JS del challenge los necesita y bloquearlos lo rompe.
  const browser: Browser = await chromium.launch({ headless: true });

  let ok = 0;
  let notFound = 0;
  let walled = 0;
  let noData = 0;
  for (const [i, laptop] of targets.entries()) {
    const url = `${BASE}/${laptop.slug}`;
    // Contexto FRESCO por ficha: Cloudflare challenge a partir de la 2ª petición si
    // se reutiliza la sesión, y su reto no se autorresuelve en headless. Una sesión
    // nueva por ficha pasa el reto como lo hace una visita normal.
    const ctx = await browser.newContext({ locale: 'es-ES', userAgent: UA });
    const page = await ctx.newPage();
    const tag = `[${i + 1}/${targets.length}] ${laptop.slug}`;
    try {
      const res = await extractTable(page, url);
      if (res.kind === '404') {
        notFound++;
        console.log(`${tag} → 404 (slug obsoleto)`);
      } else if (res.kind === 'wall') {
        walled++;
        console.log(`${tag} → ⚠️ muro Cloudflare`);
      } else {
        const parsed = parseSpecs(res.table);
        const summary = Object.entries(parsed)
          .filter(([, v]) => v != null && (!Array.isArray(v) || v.length > 0))
          .map(([k, v]) => `${k}=${Array.isArray(v) ? v.length + ' puertos' : v}`)
          .join('  ');
        console.log(`${tag}\n   ${summary || '(nada parseado)'}`);
        if (hasAny(parsed)) {
          ok++;
          if (!DRY_RUN) {
            const { error } = await supabase
              .from('specs')
              .update({
                cpu_cores: parsed.cpu_cores,
                gpu_vram_gb: parsed.gpu_vram_gb,
                screen_refresh_hz: parsed.screen_refresh_hz,
                weight_kg: parsed.weight_kg,
                battery_wh: parsed.battery_wh,
                ports: parsed.ports,
              })
              .eq('laptop_id', laptop.id);
            if (error) console.log(`   ✗ update: ${error.message}`);
          }
        } else {
          noData++;
        }
      }
    } catch (e) {
      console.log(`${tag} → error: ${(e as Error).message.slice(0, 80)}`);
    } finally {
      await ctx.close();
    }
    await sleep(DELAY);
  }

  await browser.close();
  console.log(
    `\nHecho. Con datos: ${ok}/${targets.length} · sin parsear: ${noData} · 404: ${notFound} · muro: ${walled}.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
