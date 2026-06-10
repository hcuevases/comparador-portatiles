/**
 * Enriquecimiento de benchmarks de CPU/GPU desde nanoreview.net.
 *
 * Dos pasos:
 *   1. (puro) Rellena specs.cpu_key/gpu_key extrayendo el modelo del NOMBRE del
 *      portátil (specs.cpu es solo la familia). Ver lib/benchmarks/normalize.ts.
 *   2. (Playwright) Para cada clave de componente sin fila de benchmark, resuelve el
 *      slug de nanoreview, scrapea los campos curados y hace upsert.
 *
 * Por qué Playwright: nanoreview responde 403 a fetch plano (anti-bot); un Chromium
 * real carga la página. Mismo motivo y patrón que enrich-specs (ADR-003). Como las
 * IPs de datacenter suelen bloquearse, CORRER EN LOCAL (IP residencial), no en CI.
 *
 * Uso:
 *   npm run enrich:benchmarks -- --keys-only            # solo paso 1 (sin red)
 *   npm run enrich:benchmarks -- --limit 5 --dry-run    # prueba sin escribir
 *   npm run enrich:benchmarks -- --kind cpu --limit 50  # scrapea 50 CPU
 *   npm run enrich:benchmarks -- --dump intel-core-i7-13620h --kind cpu
 *        # vuelca el HTML de una página a tmp/ para capturar fixtures del parser
 *
 * Env (de .env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { chromium, type Browser, type Page } from 'playwright';

import { extractCpuKey, extractGpuKey } from '@/lib/benchmarks/normalize';
import type { Database } from '@/lib/supabase/database.types';

loadEnv({ path: '.env.local' });

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    limit: { type: 'string', default: '50' },
    kind: { type: 'string', default: 'both' }, // cpu | gpu | both
    'dry-run': { type: 'boolean', default: false },
    'keys-only': { type: 'boolean', default: false },
    dump: { type: 'string' }, // clave a volcar (HTML → tmp/)
    delay: { type: 'string', default: '1500' },
  },
});

const LIMIT = Number(args.limit);
const KIND = args.kind as 'cpu' | 'gpu' | 'both';
const DRY_RUN = args['dry-run'];
const KEYS_ONLY = args['keys-only'];
const DELAY = Number(args.delay);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
}
const supabase = createClient<Database>(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BASE = 'https://nanoreview.net/en';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const PAGE_SIZE = 1000; // tope de PostgREST

// ─── Tipos de los campos curados ────────────────────────────────────────────

type CpuFields = {
  score: number | null;
  geekbench_single: number | null;
  geekbench_multi: number | null;
  cores: number | null;
  threads: number | null;
  tdp_w: number | null;
  release_year: number | null;
};
type GpuFields = {
  score: number | null;
  g3dmark: number | null;
  vram_gb: number | null;
  tdp_w: number | null;
};

// ─── Parsers (puros, sobre el mapa etiqueta→valor + score). Afinar con fixtures. ──

// Primer entero del valor cuya ETIQUETA casa `re`. Limpia separadores de millar
// ("12,296" / "12.296" → 12296). Para enteros simples (cores, scores).
function firstNum(map: Record<string, string>, re: RegExp): number | null {
  for (const [k, v] of Object.entries(map)) {
    if (!re.test(k)) continue;
    const cleaned = v.replace(/[.,](?=\d{3}\b)/g, '');
    const m = cleaned.match(/\d+/);
    if (m) return Number(m[0]);
  }
  return null;
}

// Máximo entero del valor (para rangos tipo "35-140 W" → 140; TDP/TGP suelen darse
// como rango configurable y el techo es lo representativo).
function maxNum(map: Record<string, string>, re: RegExp): number | null {
  for (const [k, v] of Object.entries(map)) {
    if (!re.test(k)) continue;
    const nums = (v.match(/\d+/g) ?? []).map(Number);
    if (nums.length) return Math.max(...nums);
  }
  return null;
}

// Año a 4 dígitos ("January 3, 2023" → 2023).
function yearOf(map: Record<string, string>, re: RegExp): number | null {
  for (const [k, v] of Object.entries(map)) {
    if (!re.test(k)) continue;
    const m = v.match(/\b(19|20)\d{2}\b/);
    if (m) return Number(m[0]);
  }
  return null;
}

export function parseCpu(map: Record<string, string>, score: number | null): CpuFields {
  return {
    score,
    // El nombre de la barra es "Geekbench 6 (Single-Core)"; ojo de NO casar
    // "Geekbench 6 Multi / Watt" (eficiencia) → exigir el paréntesis.
    geekbench_single: firstNum(map, /geekbench 6 \(single/i),
    geekbench_multi: firstNum(map, /geekbench 6 \(multi/i),
    cores: firstNum(map, /total cores/i) ?? firstNum(map, /^cores$/i),
    threads: firstNum(map, /^threads$/i),
    tdp_w: maxNum(map, /\btdp\b/i),
    release_year: yearOf(map, /released|release date/i),
  };
}

export function parseGpu(map: Record<string, string>, score: number | null): GpuFields {
  // nanoreview etiqueta los 3DMark por su test ("Time Spy", "Fire Strike"…). Time Spy
  // es el más citado para comparar GPU; fallback a Fire Strike / G3D Mark (PassMark).
  return {
    score,
    g3dmark:
      firstNum(map, /^time spy$/i) ?? firstNum(map, /^fire strike$/i) ?? firstNum(map, /g3d mark/i),
    vram_gb: firstNum(map, /memory size|\bvram\b/i),
    tdp_w: maxNum(map, /\btgp\b|\btdp\b/i),
  };
}

function hasCpuData(f: CpuFields): boolean {
  return Object.values(f).some((v) => v !== null);
}
function hasGpuData(f: GpuFields): boolean {
  return Object.values(f).some((v) => v !== null);
}

// ─── Extracción del DOM de nanoreview (best-effort) ─────────────────────────

type PageData = { map: Record<string, string>; score: number | null; html: string };
type Extract = { kind: 'ok'; data: PageData } | { kind: '404' } | { kind: 'wall' };

async function extractPage(page: Page, url: string): Promise<Extract> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const status = await page
    .waitForFunction(
      () => {
        const t = document.title || '';
        if (/404|not found|page not found/i.test(t)) return '404';
        if (/just a moment|verifying you are human|attention required/i.test(t)) return false;
        // Señal de página de componente: hay tabla de specs o el bloque de score.
        const hasRows = document.querySelectorAll('table tr, .specs-table, .card-specs').length > 0;
        return hasRows ? 'ok' : false;
      },
      { timeout: 12000 },
    )
    .then((h) => h.jsonValue() as Promise<string>)
    .catch(() => null);

  if (status === '404') return { kind: '404' };
  const title = await page.title();
  if (/just a moment|verifying you are human|attention required/i.test(title)) return { kind: 'wall' };

  const data = await page.evaluate(() => {
    const out: Record<string, string> = {};
    // (a) Specs: tabla <td>etiqueta</td><td>valor</td> (Released, Total Cores, TGP…).
    document.querySelectorAll('tr').forEach((tr) => {
      const cells = tr.querySelectorAll('td, th');
      if (cells.length >= 2) {
        const label = ((cells[0] as HTMLElement).innerText || '').trim();
        const value = ((cells[1] as HTMLElement).innerText || '').trim();
        if (label && value && label.length < 60 && !(label in out)) out[label] = value;
      }
    });
    // (b) Benchmarks: se pintan como barras (.score-bar), NO como filas de tabla.
    //     nombre (.score-bar-name) → resultado (.score-bar-result-number).
    document.querySelectorAll('.score-bar').forEach((bar) => {
      const name = ((bar.querySelector('.score-bar-name') as HTMLElement | null)?.innerText || '')
        .replace(/\s+/g, ' ')
        .trim();
      const val = ((bar.querySelector('.score-bar-result-number') as HTMLElement | null)?.innerText || '').trim();
      if (name && val && !(name in out)) out[name] = val;
    });
    // El "score" global 0-100 de nanoreview no tiene un contenedor estable; se deja
    // null y se usan los benchmarks crudos (Geekbench/3DMark) como métrica comparable.
    return { map: out, score: null as number | null, html: document.documentElement.outerHTML };
  });
  return { kind: 'ok', data };
}

// ─── Paso 1: rellenar specs.cpu_key / gpu_key (puro, sin red) ───────────────

type SpecKeyRow = {
  laptop_id: string;
  cpu: string | null;
  gpu: string | null;
  cpu_key: string | null;
  gpu_key: string | null;
  laptops: { model: string };
};

async function fillKeys(): Promise<void> {
  let from = 0;
  let scanned = 0;
  let updated = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('specs')
      .select('laptop_id, cpu, gpu, cpu_key, gpu_key, laptops!inner(model)')
      .or('cpu_key.is.null,gpu_key.is.null')
      .range(from, from + PAGE_SIZE - 1)
      .returns<SpecKeyRow[]>();
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const row of data) {
      scanned++;
      const patch: { cpu_key?: string | null; gpu_key?: string | null } = {};
      if (row.cpu_key === null) {
        const k = extractCpuKey(row.laptops.model, row.cpu);
        if (k) patch.cpu_key = k;
      }
      if (row.gpu_key === null) {
        const k = extractGpuKey(row.gpu, row.laptops.model);
        if (k) patch.gpu_key = k;
      }
      if (Object.keys(patch).length > 0) {
        updated++;
        if (!DRY_RUN) {
          const { error: upErr } = await supabase
            .from('specs')
            .update(patch)
            .eq('laptop_id', row.laptop_id);
          if (upErr) console.log(`   ✗ update ${row.laptop_id}: ${upErr.message}`);
        }
      }
    }
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  console.log(`Paso 1 (claves): escaneadas ${scanned}, con clave nueva ${updated}${DRY_RUN ? ' (dry)' : ''}.`);
}

// ─── Paso 2: scrapear componentes sin fila de benchmark ─────────────────────

async function pagedDistinct(column: 'cpu_key' | 'gpu_key'): Promise<Set<string>> {
  const out = new Set<string>();
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('specs')
      .select(column)
      .not(column, 'is', null)
      .range(from, from + PAGE_SIZE - 1)
      .returns<Record<string, string | null>[]>();
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const v = r[column];
      if (v) out.add(v);
    }
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return out;
}

async function existingKeys(table: 'cpu_benchmarks' | 'gpu_benchmarks'): Promise<Set<string>> {
  const out = new Set<string>();
  const { data, error } = await supabase.from(table).select('component_key').returns<{ component_key: string }[]>();
  if (error) throw new Error(error.message);
  for (const r of data ?? []) out.add(r.component_key);
  return out;
}

async function overrideSlug(kind: 'cpu' | 'gpu', key: string): Promise<string | null> {
  const { data } = await supabase
    .from('benchmark_overrides')
    .select('nanoreview_slug')
    .eq('kind', kind)
    .eq('source_key', key)
    .maybeSingle<{ nanoreview_slug: string }>();
  return data?.nanoreview_slug ?? null;
}

// Slugs candidatos a probar en orden. nanoreview cambió el sufijo de las GPU de
// portátil entre generaciones: 50-series usa `-laptop`, 40-series y anteriores
// `-mobile`; AMD/Arc no llevan sufijo. La CPU casa directa con la clave.
function candidateSlugs(kind: 'cpu' | 'gpu', key: string): string[] {
  if (kind === 'cpu') return [key];
  if (key.startsWith('geforce-')) return [`${key}-laptop`, `${key}-mobile`];
  return [key, `${key}-mobile`];
}

async function scrapeKind(kind: 'cpu' | 'gpu', browser: Browser): Promise<void> {
  const col = kind === 'cpu' ? 'cpu_key' : 'gpu_key';
  const table = kind === 'cpu' ? 'cpu_benchmarks' : 'gpu_benchmarks';
  const needed = [...(await pagedDistinct(col))].filter((k) => !existingSets[table].has(k)).slice(0, LIMIT);
  console.log(`Paso 2 (${kind}): ${needed.length} componente(s) a scrapear.`);

  let ok = 0;
  let notFound = 0;
  let walled = 0;
  for (const [i, key] of needed.entries()) {
    const tag = `[${i + 1}/${needed.length}] ${key}`;
    const override = await overrideSlug(kind, key);
    const candidates = override ? [override] : candidateSlugs(kind, key);

    // Probar candidatos en orden: el primero que devuelve página real gana. Un 404
    // pasa al siguiente; un muro corta (transitorio, se reintenta otra tanda).
    let okData: PageData | null = null;
    let usedSlug = candidates[0];
    let wall = false;
    for (const slug of candidates) {
      const ctx = await browser.newContext({ locale: 'en-US', userAgent: UA });
      const page = await ctx.newPage();
      try {
        const res = await extractPage(page, `${BASE}/${kind}/${slug}`);
        if (res.kind === 'ok') {
          okData = res.data;
          usedSlug = slug;
          break;
        }
        if (res.kind === 'wall') {
          wall = true;
          break;
        }
        // 404 → siguiente candidato
      } catch (e) {
        console.log(`${tag} (${slug}) → error: ${(e as Error).message.slice(0, 60)}`);
      } finally {
        await ctx.close();
      }
    }

    if (wall) {
      walled++;
      console.log(`${tag} → ⚠️ muro anti-bot`);
    } else if (!okData) {
      notFound++;
      console.log(`${tag} → 404 (probados: ${candidates.join(', ')})`);
      if (!DRY_RUN) await upsertNotFound(kind, key, candidates[candidates.length - 1]);
    } else if (kind === 'cpu') {
      const f = parseCpu(okData.map, okData.score);
      console.log(`${tag} (${usedSlug}) → ${JSON.stringify(f)}`);
      if (hasCpuData(f)) {
        ok++;
        if (!DRY_RUN) await upsertCpu(key, usedSlug, f);
      } else if (!DRY_RUN) await upsertNotFound('cpu', key, usedSlug);
    } else {
      const f = parseGpu(okData.map, okData.score);
      console.log(`${tag} (${usedSlug}) → ${JSON.stringify(f)}`);
      if (hasGpuData(f)) {
        ok++;
        if (!DRY_RUN) await upsertGpu(key, usedSlug, f);
      } else if (!DRY_RUN) await upsertNotFound('gpu', key, usedSlug);
    }
    await sleep(DELAY);
  }
  console.log(`  ${kind}: ok ${ok} · 404 ${notFound} · muro ${walled}.`);
}

async function upsertCpu(key: string, slug: string, f: CpuFields): Promise<void> {
  const { error } = await supabase.from('cpu_benchmarks').upsert({
    component_key: key,
    nanoreview_slug: slug,
    status: 'ok',
    scraped_at: new Date().toISOString(),
    ...f,
  });
  if (error) console.log(`   ✗ upsert cpu ${key}: ${error.message}`);
}

async function upsertGpu(key: string, slug: string, f: GpuFields): Promise<void> {
  const { error } = await supabase.from('gpu_benchmarks').upsert({
    component_key: key,
    nanoreview_slug: slug,
    status: 'ok',
    scraped_at: new Date().toISOString(),
    ...f,
  });
  if (error) console.log(`   ✗ upsert gpu ${key}: ${error.message}`);
}

async function upsertNotFound(kind: 'cpu' | 'gpu', key: string, slug: string): Promise<void> {
  const table = kind === 'cpu' ? 'cpu_benchmarks' : 'gpu_benchmarks';
  const { error } = await supabase
    .from(table)
    .upsert({ component_key: key, nanoreview_slug: slug, status: 'notfound', scraped_at: new Date().toISOString() });
  if (error) console.log(`   ✗ upsert notfound ${key}: ${error.message}`);
}

// Cache de claves ya scrapeadas, cargada una vez antes de scrapear.
const existingSets: Record<'cpu_benchmarks' | 'gpu_benchmarks', Set<string>> = {
  cpu_benchmarks: new Set(),
  gpu_benchmarks: new Set(),
};

// ─── Modo dump: vuelca el HTML de una página para capturar fixtures ─────────

async function dump(kind: 'cpu' | 'gpu', key: string): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const override = await overrideSlug(kind, key);
  const candidates = override ? [override] : candidateSlugs(kind, key);
  mkdirSync('tmp', { recursive: true });
  for (const slug of candidates) {
    const ctx = await browser.newContext({ locale: 'en-US', userAgent: UA });
    const page = await ctx.newPage();
    const res = await extractPage(page, `${BASE}/${kind}/${slug}`);
    await ctx.close();
    if (res.kind === 'ok') {
      writeFileSync(`tmp/nanoreview-${kind}-${key}.html`, res.data.html);
      writeFileSync(
        `tmp/nanoreview-${kind}-${key}.json`,
        JSON.stringify({ slug, map: res.data.map, score: res.data.score }, null, 2),
      );
      console.log(`Volcado tmp/nanoreview-${kind}-${key}.* (slug: ${slug}).`);
      await browser.close();
      return;
    }
    console.log(`  ${slug} → ${res.kind}`);
  }
  console.log('No se pudo volcar (ningún candidato dio página).');
  await browser.close();
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (args.dump) {
    const kind = KIND === 'gpu' ? 'gpu' : 'cpu';
    await dump(kind, args.dump);
    return;
  }

  await fillKeys();
  if (KEYS_ONLY) return;

  existingSets.cpu_benchmarks = await existingKeys('cpu_benchmarks');
  existingSets.gpu_benchmarks = await existingKeys('gpu_benchmarks');

  const browser: Browser = await chromium.launch({ headless: true });
  try {
    if (KIND === 'cpu' || KIND === 'both') await scrapeKind('cpu', browser);
    if (KIND === 'gpu' || KIND === 'both') await scrapeKind('gpu', browser);
  } finally {
    await browser.close();
  }
}

// `positionals` no se usa hoy (claves van por --dump); referencia para silenciar
// el linter si se activa noUnusedLocals en scripts.
void positionals;

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
