/**
 * Ingesta de catálogo de portátiles desde PcComponentes (vía Algolia).
 *
 * PcComponentes usa Algolia como backend de búsqueda — las credenciales
 * (App ID + Search API Key) son públicas y se inyectan en el HTML servido al
 * cliente. Las usamos en modo read-only contra el mismo índice que el navegador.
 * No estamos haciendo nada que no haga su propio frontend.
 *
 * Ventajas frente a scrapear el HTML:
 * - Datos estructurados (specs, marca, precio) sin parsear DOM.
 * - Paginación nativa, mucho más rápido que renderizar con Playwright.
 * - Sin dependencia de Chromium ni de la estabilidad de selectors CSS.
 *
 * Uso:
 *   npm run scrape:catalog -- --limit 5
 *   npm run scrape:catalog -- --limit 100
 *   npm run scrape:catalog -- --limit 5 --dry-run
 *
 * Variables de entorno requeridas (de .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

import type { Database, TablesInsert } from '@/lib/supabase/database.types';

loadEnv({ path: '.env.local' });

// ─── CLI ──────────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    limit: { type: 'string', default: '5' },
    'dry-run': { type: 'boolean', default: false },
    'discover-categories': { type: 'boolean', default: false },
    // Modo cron diario: solo refresca prices_history para los slugs ya
    // existentes en BD. Salta laptops/specs/affiliate_links. Más rápido y
    // no añade catálogo nuevo (eso se hace con el modo completo, p. ej.
    // desde el cron semanal).
    'prices-only': { type: 'boolean', default: false },
  },
});

const LIMIT = Number(args.limit);
const DRY_RUN = args['dry-run'];
const DISCOVER_CATS = args['discover-categories'];
const PRICES_ONLY = args['prices-only'];

if (!Number.isFinite(LIMIT) || LIMIT < 1) {
  throw new Error('--limit debe ser un número positivo');
}

// ─── Supabase ─────────────────────────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
}
const supabase = createClient<Database>(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Algolia ──────────────────────────────────────────────────────────────

// Claves públicas extraídas del HTML de https://www.pccomponentes.com/portatiles
// (window.__STATE__.store.algolia). Son search-only, idénticas a las que usa el
// navegador del cliente.
const ALGOLIA_APP_ID = 'BEWOYX1CF1';
const ALGOLIA_API_KEY = '47978d8b445ceaceb718dd842d434099';
// Algolia es multi-locale aquí. `products_list` sin sufijo da 404 porque es solo
// la "base"; los índices reales tienen sufijo de locale. Para España usamos `:es`.
// (Confirmado por la URL real del autocomplete: `products_list:es_query_suggestions`.)
const ALGOLIA_INDEX = 'products_list:es';

const RETAILER_SLUG = 'pccomponentes';
const RETAILER_NAME = 'PcComponentes';
const BASE = 'https://www.pccomponentes.com';

// El catálogo entero son 156k productos. Filtramos por la categoría principal
// "1115:Portátiles" (descubierta con `--discover-categories`). PcComponentes
// usa el patrón `<id>:<nombre>` en su taxonomía interna; con el ID prefijado
// somos resistentes a renames del nombre legible.
const CATEGORY_FILTER = 'mainCategoryKeyName:"1115:Portátiles"';
const HITS_PER_PAGE = 24;

// ─── Tipos ────────────────────────────────────────────────────────────────

// Tipamos solo lo que esperamos usar. El resto del payload se ignora.
// Marcado todo como `unknown` para no asumir shapes; el parser hace las
// conversiones defensivas.
type AlgoliaHit = Record<string, unknown>;

type AlgoliaResponse = {
  hits: AlgoliaHit[];
  nbHits: number;
  page: number;
  nbPages: number;
};

type LaptopDetail = {
  slug: string;
  brand: string;
  model: string;
  year: number | null;
  description: string | null;
  imageUrl: string | null;
  specs: Omit<TablesInsert<'specs'>, 'laptop_id'>;
  priceEur: number | null;
  affiliateUrl: string;
};

// ─── Algolia request ──────────────────────────────────────────────────────

async function searchAlgolia(page: number, debug = false): Promise<AlgoliaResponse> {
  const url = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`;
  const body: Record<string, unknown> = {
    query: '',
    hitsPerPage: HITS_PER_PAGE,
    page,
  };
  if (CATEGORY_FILTER) body.filters = CATEGORY_FILTER;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Algolia-Application-Id': ALGOLIA_APP_ID,
      'X-Algolia-API-Key': ALGOLIA_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Algolia ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = (await res.json()) as AlgoliaResponse;

  // Primera vez: vuelca un hit a disco para que podamos inspeccionar el shape
  // exacto sin saturar la consola.
  if (debug && data.hits.length > 0) {
    const fs = await import('node:fs/promises');
    const debugFile = 'scrape-debug-algolia-hit.json';
    try {
      await fs.access(debugFile);
    } catch {
      await fs.writeFile(debugFile, JSON.stringify(data.hits[0], null, 2), 'utf8');
      console.log(`     📦 Volcado primer hit a ${debugFile} para revisar shape.`);
    }
  }

  return data;
}

// ─── Mapeo de hit a nuestro modelo ────────────────────────────────────────

function asString(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const cleaned = v.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.');
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function extractYear(s: string | null): number | null {
  if (!s) return null;
  const m = s.match(/\b(20\d{2})\b/);
  return m ? Number(m[1]) : null;
}

function parseStorageGb(s: string | null): number | null {
  if (!s) return null;
  if (/tb/i.test(s)) {
    const m = s.match(/(\d+[.,]?\d*)\s*tb/i);
    return m ? Math.round(Number(m[1].replace(',', '.')) * 1024) : null;
  }
  const m = s.match(/(\d+)\s*gb/i);
  return m ? Number(m[1]) : null;
}

function extractStorageType(s: string | null): string | null {
  if (!s) return null;
  if (/nvme/i.test(s)) return 'NVMe';
  if (/ssd/i.test(s)) return 'SSD';
  if (/hdd/i.test(s)) return 'HDD';
  if (/emmc/i.test(s)) return 'eMMC';
  return null;
}

function extractResolution(s: string | null): string | null {
  if (!s) return null;
  const m = s.match(/(\d{3,4})\s*[x×]\s*(\d{3,4})/i);
  if (m) return `${m[1]}x${m[2]}`;
  if (/4k|uhd/i.test(s)) return '3840x2160';
  if (/qhd|2k/i.test(s)) return '2560x1440';
  if (/fhd|full ?hd/i.test(s)) return '1920x1080';
  if (/\bhd\b/i.test(s)) return '1366x768';
  return null;
}

function extractInches(s: string | null): number | null {
  if (!s) return null;
  const m = s.match(/(\d+[.,]?\d*)\s*("|″|''|inch|pulg)/i);
  if (!m) return null;
  return Number(m[1].replace(',', '.'));
}

function mapHit(hit: AlgoliaHit): LaptopDetail | null {
  const brand = asString(hit.brandName);
  const name = asString(hit.name);
  const slug = asString(hit.slug);

  if (!brand || !name || !slug) {
    console.warn(`     ⚠ Hit sin brandName/name/slug. id=${hit.id}. Saltando.`);
    return null;
  }

  const price = asNumber(hit.price);
  const description = asString(hit.description);

  // images = { large, medium, small } o lista de URLs. Preferimos large.
  const imagesObj = hit.images as { large?: string; medium?: string; small?: string } | undefined;
  const imageUrl = asString(imagesObj?.large ?? imagesObj?.medium ?? imagesObj?.small ?? null);

  // PcComponentes guarda todos los specs estructurados en `filtersWithGroup`,
  // con formato '<groupId>:<groupName>:<filterId>:<filterValue>:TYPE:meta'.
  // Es muchísimo más completo que `topAttributes` (que solo trae 3-4 specs).
  // Indexamos por nombre del grupo normalizado para buscar con tolerancia.
  const fwg = (hit.filtersWithGroup ?? []) as string[];
  const attrMap = new Map<string, string>();
  for (const raw of fwg) {
    if (typeof raw !== 'string') continue;
    // El formato puede tener `:` dentro de los meta finales — split limitado
    // a 6 partes para preservarlas.
    const parts = raw.split(':');
    if (parts.length < 4) continue;
    const groupName = parts[1];
    const filterValue = parts[3];
    if (groupName && filterValue) {
      // Si el mismo grupo aparece varias veces (raro), conservamos el primero.
      const key = normalize(groupName);
      if (!attrMap.has(key)) attrMap.set(key, filterValue);
    }
  }

  function attr(...candidates: string[]): string | null {
    for (const c of candidates) {
      const v = attrMap.get(normalize(c));
      if (v) return v;
    }
    return null;
  }

  const cpuRaw = attr('procesador', 'cpu');
  const ramRaw = attr('memoria ram', 'ram', 'memoria');
  const storageRaw =
    attr('almacenamiento ssd', 'capacidad disco duro', 'almacenamiento', 'disco duro', 'ssd', 'capacidad');
  const gpuRaw = attr('tarjeta grafica', 'tarjeta gráfica', 'gpu', 'grafica');
  const screenRaw = attr('tamano de portatil', 'tamaño de portátil', 'pulgadas', 'tamano pantalla', 'pantalla');
  const resolutionRaw = attr('resolucion', 'resolución', 'resolucion de pantalla');
  const refreshRaw = attr('frecuencia de refresco', 'frecuencia', 'refresh');
  const weightRaw = attr('peso');
  const batteryRaw = attr('bateria', 'batería');
  const osRaw = attr('modelo sistema operativo', 'sistema operativo', 'so');

  // Marca al inicio del nombre. PcComponentes mete a veces "Portátil" delante,
  // así que primero quitamos esa palabra introductoria y luego intentamos quitar
  // la marca si está al inicio. Resultado: modelo limpio.
  const nameWithoutPrefix = name.replace(/^Port[áa]til\s+/i, '').trim();
  const model = nameWithoutPrefix.toLowerCase().startsWith(brand.toLowerCase())
    ? nameWithoutPrefix.slice(brand.length).trim()
    : nameWithoutPrefix;

  return {
    slug,
    brand,
    model,
    year: extractYear(name),
    description,
    imageUrl,
    specs: {
      cpu: cpuRaw,
      cpu_cores: asNumber(attr('nucleos', 'núcleos', 'cores')),
      ram_gb: asNumber(ramRaw),
      storage_gb: parseStorageGb(storageRaw),
      storage_type: extractStorageType(storageRaw),
      gpu: gpuRaw,
      gpu_vram_gb: asNumber(attr('vram', 'memoria grafica', 'memoria gráfica')),
      screen_inches: extractInches(screenRaw),
      screen_resolution: extractResolution(resolutionRaw ?? screenRaw),
      screen_refresh_hz: asNumber(refreshRaw),
      weight_kg: asNumber(weightRaw),
      battery_wh: asNumber(batteryRaw),
      ports: null, // PcComponentes no expone esto en topAttributes
      os: osRaw,
    },
    priceEur: price,
    affiliateUrl: `${BASE}/${slug}`,
  };
}

function normalize(s: string): string {
  // NFD descompone "á" en "a" + diacrítico combinado; el regex quita los
  // diacríticos (rango Unicode U+0300..U+036F). Resultado: "Pulgadas" ≈ "pulgadas",
  // "Tamaño" → "tamano", etc. Es lo que hace falta para hacer keys insensibles a tildes.
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

// ─── Upsert en Supabase ───────────────────────────────────────────────────

async function getOrCreateRetailerId(): Promise<string> {
  const { data, error } = await supabase
    .from('retailers')
    .select('id')
    .eq('slug', RETAILER_SLUG)
    .maybeSingle();
  if (error) throw error;
  if (data) return data.id;

  const insertPayload: TablesInsert<'retailers'> = {
    slug: RETAILER_SLUG,
    name: RETAILER_NAME,
    base_url: BASE,
    active: true,
  };
  const { data: created, error: createErr } = await supabase
    .from('retailers')
    .insert([insertPayload])
    .select('id')
    .single();
  if (createErr) throw createErr;
  return created.id;
}

/**
 * Inserta un punto de precio en prices_history dado un laptop_id ya existente.
 * Función compartida por el modo completo y por el modo --prices-only.
 */
async function insertPriceHistory(
  laptopId: string,
  retailerId: string,
  priceEur: number,
): Promise<void> {
  const pricePayload: TablesInsert<'prices_history'> = {
    laptop_id: laptopId,
    retailer_id: retailerId,
    price_eur: priceEur,
    in_stock: true,
  };
  await supabase.from('prices_history').insert([pricePayload]);
}

/**
 * Modo --prices-only: busca el laptop por slug; si existe, añade un punto de
 * precio. Si no existe, lo salta (no añadimos catálogo nuevo desde el cron
 * diario; eso lo hace el cron semanal con upsert completo).
 *
 * Devuelve true si insertó precio, false si se saltó.
 */
async function refreshPriceOnly(detail: LaptopDetail, retailerId: string): Promise<boolean> {
  if (detail.priceEur === null) return false;

  if (DRY_RUN) {
    console.log(`  [dry-run prices-only] ${detail.brand} ${detail.model} — ${detail.priceEur}€`);
    return true;
  }

  const { data: laptop } = await supabase
    .from('laptops')
    .select('id')
    .eq('slug', detail.slug)
    .maybeSingle();

  if (!laptop) {
    // Slug no está en BD — lo saltamos (catálogo nuevo no entra por aquí).
    return false;
  }

  await insertPriceHistory(laptop.id, retailerId, detail.priceEur);
  console.log(`  ✓ ${detail.brand} ${detail.model} — ${detail.priceEur}€`);
  return true;
}

async function upsertLaptop(detail: LaptopDetail, retailerId: string): Promise<void> {
  if (DRY_RUN) {
    console.log(`  [dry-run] ${detail.brand} ${detail.model} — ${detail.priceEur ?? '?'}€`);
    console.log(`            specs: ${JSON.stringify(detail.specs)}`);
    return;
  }

  const laptopPayload: TablesInsert<'laptops'> = {
    slug: detail.slug,
    brand: detail.brand,
    model: detail.model,
    year: detail.year,
    description: detail.description,
    image_url: detail.imageUrl,
  };
  const { data: laptop, error: lapErr } = await supabase
    .from('laptops')
    .upsert([laptopPayload], { onConflict: 'slug' })
    .select('id')
    .single();
  if (lapErr) {
    console.error(`  ✗ Error upsert laptop ${detail.slug}: ${lapErr.message}`);
    return;
  }

  const specsPayload: TablesInsert<'specs'> = {
    laptop_id: laptop.id,
    ...detail.specs,
  };
  const { error: specsErr } = await supabase
    .from('specs')
    .upsert([specsPayload], { onConflict: 'laptop_id' });
  if (specsErr) {
    console.error(`  ✗ Error upsert specs: ${specsErr.message}`);
  }

  // Affiliate link: insert o update (no hay unique constraint en laptop+retailer)
  const { data: existingLink } = await supabase
    .from('affiliate_links')
    .select('id')
    .eq('laptop_id', laptop.id)
    .eq('retailer_id', retailerId)
    .maybeSingle();

  if (existingLink) {
    await supabase
      .from('affiliate_links')
      .update({ url: detail.affiliateUrl, active: true })
      .eq('id', existingLink.id);
  } else {
    const linkPayload: TablesInsert<'affiliate_links'> = {
      laptop_id: laptop.id,
      retailer_id: retailerId,
      url: detail.affiliateUrl,
      active: true,
    };
    await supabase.from('affiliate_links').insert([linkPayload]);
  }

  // Precio actual en prices_history (siempre nuevo punto en el tiempo)
  if (detail.priceEur !== null) {
    await insertPriceHistory(laptop.id, retailerId, detail.priceEur);
  }

  console.log(`  ✓ ${detail.brand} ${detail.model} — ${detail.priceEur ?? '?'}€`);
}

// ─── Main ─────────────────────────────────────────────────────────────────

/**
 * Modo de descubrimiento: lista las categorías top de PcComponentes con su
 * conteo de productos. Sirve para saber el nombre EXACTO con el que filtrar
 * (tildes, mayúsculas, sufijos, lo que sea). Imprime resultado y termina.
 */
async function discoverCategories(): Promise<void> {
  const url = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`;
  const body = {
    query: '',
    hitsPerPage: 0,
    facets: [
      'hierarchicalCategories.lvl0',
      'mainCategoryKeyName',
      'familiesKeyName',
    ],
    maxValuesPerFacet: 100,
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Algolia-Application-Id': ALGOLIA_APP_ID,
      'X-Algolia-API-Key': ALGOLIA_API_KEY,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Algolia ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }
  const data = (await res.json()) as { facets?: Record<string, Record<string, number>> };

  for (const facetField of Object.keys(data.facets ?? {})) {
    console.log(`\n=== ${facetField} ===`);
    const values = data.facets![facetField];
    const entries = Object.entries(values).sort((a, b) => b[1] - a[1]);
    for (const [value, count] of entries) {
      // Resaltamos los que contienen "ortati" (portátil/portatil)
      const marker = /ortati/i.test(value) ? '  ← portátiles' : '';
      console.log(`  ${count.toString().padStart(7)}  ${value}${marker}`);
    }
  }
}

async function main() {
  if (DISCOVER_CATS) {
    console.log('🔎 Descubriendo categorías (no se escribe nada en DB)\n');
    await discoverCategories();
    return;
  }

  const mode = PRICES_ONLY ? 'prices-only' : 'completo';
  console.log(
    `🚀 Ingesta PcComponentes (modo=${mode}, limit=${LIMIT}, dry-run=${DRY_RUN})`,
  );

  const retailerId = DRY_RUN ? 'dry-run' : await getOrCreateRetailerId();
  if (!DRY_RUN) console.log(`   retailer_id: ${retailerId}`);

  let page = 0;
  let processed = 0;
  let ok = 0;
  let skipped = 0;
  let fail = 0;
  let firstCall = true;

  while (processed < LIMIT) {
    const res = await searchAlgolia(page, firstCall);
    firstCall = false;
    console.log(`📄 Página ${page + 1}/${res.nbPages} — ${res.hits.length} hits (total catálogo: ${res.nbHits})`);

    if (res.hits.length === 0) {
      console.log('   (sin más hits)');
      break;
    }

    for (const hit of res.hits) {
      if (processed >= LIMIT) break;
      processed += 1;
      const detail = mapHit(hit);
      if (!detail) {
        fail += 1;
        continue;
      }
      try {
        if (PRICES_ONLY) {
          const inserted = await refreshPriceOnly(detail, retailerId);
          if (inserted) ok += 1;
          else skipped += 1;
        } else {
          await upsertLaptop(detail, retailerId);
          ok += 1;
        }
      } catch (err) {
        console.error(`  ✗ Excepción: ${(err as Error).message}`);
        fail += 1;
      }
    }

    if (page + 1 >= res.nbPages) break;
    page += 1;
    // Cortesía con Algolia — su rate limit es generoso pero no abusemos.
    await sleep(300);
  }

  const skippedSuffix = PRICES_ONLY ? `, ${skipped} saltados (no en BD)` : '';
  console.log(`\n✅ Hecho: ${ok} ok, ${fail} fallidos${skippedSuffix} (${processed} procesados)`);
}

main().catch((err) => {
  console.error('💥 Error fatal:', err);
  process.exit(1);
});
