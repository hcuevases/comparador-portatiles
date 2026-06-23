# Descubrimiento de MediaMarkt (Tradedoubler) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que `enrich:mediamarkt --discover` cree laptops nuevos del feed de MediaMarkt (vía Products API de Tradedoubler) que no estén en catálogo, reutilizando el núcleo `discoverOrAttach`.

**Architecture:** Tradedoubler es una API paginada con tope de 1.000 productos/búsqueda, así que se enumera por keyword (`portatil/laptop/notebook/macbook`) con dedup por EAN y red de seguridad `isLaptopProduct`. Una nueva `enumerateLaptops` (con fuente inyectable `fetchPage`) y un mapeador `toDiscovered` alimentan el `discoverOrAttach` existente, sin tocarlo. Todo gated a credenciales y mock-testeable.

**Tech Stack:** TypeScript (strict), tsx scripts, Vitest, Supabase service-role client. Convención del repo: CRLF (no `prettier --write`), CI = `eslint` + `tsc` + `vitest run`.

**Spec:** `docs/superpowers/specs/2026-06-23-descubrimiento-mediamarkt-design.md`

---

### Task 1: Ampliar los tipos de Tradedoubler

**Files:**
- Modify: `lib/tradedoubler/types.ts`

- [ ] **Step 1: Añadir campos de descubrimiento a los tipos**

En `lib/tradedoubler/types.ts`, añadir `brand` y `categories` a `TdProduct`, un tipo `TdCategory`, y `productHeader` a la respuesta. Resultado completo del archivo:

```ts
// Subconjunto de la respuesta de la Products API de Tradedoubler (MediaMarkt). Solo
// modelamos lo que leemos; todo opcional porque la API omite campos sin datos.

export type TdPrice = { value?: string | number; currency?: string };
export type TdImage = { url?: string };
export type TdIdentifiers = { ean?: string; sku?: string };
export type TdCategory = { name?: string };

export type TdProduct = {
  name?: string;
  productUrl?: string; // enlace YA trackeado (afiliado) — el que guardamos
  sourceProductUrl?: string; // enlace sin trackear del anunciante
  price?: TdPrice;
  productImage?: TdImage;
  identifiers?: TdIdentifiers;
  availability?: string; // texto libre del anunciante ("in stock", etc.)
  brand?: string; // para descubrimiento (parseBrandModel)
  categories?: TdCategory[]; // para descubrimiento (isLaptopProduct)
};

// `productHeader.totalHits` = total de resultados de la búsqueda (para paginar).
export type TdProductsResponse = { products?: TdProduct[]; productHeader?: { totalHits?: number } };
```

- [ ] **Step 2: Verificar typecheck**

Run: `npm run typecheck`
Expected: PASS (sin errores)

- [ ] **Step 3: Commit**

```bash
git add lib/tradedoubler/types.ts
git commit -m "feat(tradedoubler): tipos para descubrimiento (brand, categories, totalHits)"
```

---

### Task 2: Mapeador `toDiscovered` (TdProduct → DiscoveredProduct)

**Files:**
- Modify: `lib/tradedoubler/map-product.ts`
- Test: `lib/tradedoubler/map-product.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Añadir al final de `lib/tradedoubler/map-product.test.ts` (y añadir `toDiscovered` al import de `./map-product`):

```ts
describe('toDiscovered', () => {
  const base = {
    name: 'Portátil Acer Aspire 5',
    productUrl: 'https://clk.tradedoubler.com/click?url=x',
    price: { value: '899.00', currency: 'EUR' },
    productImage: { url: 'https://img/x.jpg' },
    identifiers: { ean: '4711121212121' },
    brand: 'Acer',
    categories: [{ name: 'Portátiles' }],
    availability: 'in stock',
  };

  it('mapea un producto completo', () => {
    expect(toDiscovered(base)).toEqual({
      ean: '4711121212121',
      name: 'Portátil Acer Aspire 5',
      brand: 'Acer',
      category: 'Portátiles',
      imageUrl: 'https://img/x.jpg',
      offer: { url: 'https://clk.tradedoubler.com/click?url=x', priceEur: 899, inStock: true },
    });
  });

  it('descarta si no hay EAN', () => {
    expect(toDiscovered({ ...base, identifiers: {} })).toBeNull();
    expect(toDiscovered({ ...base, identifiers: undefined })).toBeNull();
  });

  it('descarta si no hay productUrl (mapProduct → null)', () => {
    expect(toDiscovered({ ...base, productUrl: undefined })).toBeNull();
  });

  it('campos opcionales ausentes → null/cadena vacía, sin romper', () => {
    const r = toDiscovered({ productUrl: 'https://x', identifiers: { ean: '1' } });
    expect(r).toEqual({
      ean: '1',
      name: '',
      brand: null,
      category: null,
      imageUrl: null,
      offer: { url: 'https://x', priceEur: null, inStock: null },
    });
  });
});
```

- [ ] **Step 2: Ejecutar los tests para verificar que fallan**

Run: `npx vitest run lib/tradedoubler/map-product.test.ts`
Expected: FAIL (`toDiscovered is not a function` / no exportada)

- [ ] **Step 3: Implementar `toDiscovered`**

En `lib/tradedoubler/map-product.ts`: añadir el import del tipo y la función al final.

Añadir a los imports del principio:

```ts
import type { DiscoveredProduct } from '@/lib/connectors/discover';
```

Añadir al final del archivo:

```ts
/**
 * Mapea un producto de Tradedoubler a `DiscoveredProduct` para el descubrimiento.
 * Devuelve null si falta el EAN (no se puede dedup ni casar) o si no hay oferta
 * válida (mapProduct → null, p.ej. sin productUrl).
 */
export function toDiscovered(p: TdProduct): DiscoveredProduct | null {
  const ean = p.identifiers?.ean;
  if (!ean) return null;
  const offer = mapProduct(p);
  if (!offer) return null;
  return {
    ean,
    name: p.name ?? '',
    brand: p.brand ?? null,
    category: p.categories?.[0]?.name ?? null,
    imageUrl: p.productImage?.url ?? null,
    offer,
  };
}
```

- [ ] **Step 4: Ejecutar los tests para verificar que pasan**

Run: `npx vitest run lib/tradedoubler/map-product.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/tradedoubler/map-product.ts lib/tradedoubler/map-product.test.ts
git commit -m "feat(tradedoubler): toDiscovered (TdProduct → DiscoveredProduct)"
```

---

### Task 3: `enumerateLaptops` (paginación por keyword + dedup por EAN)

**Files:**
- Modify: `lib/tradedoubler/client.ts`
- Test: `lib/tradedoubler/client.test.ts` (crear)

- [ ] **Step 1: Escribir los tests que fallan**

Crear `lib/tradedoubler/client.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import { enumerateLaptops, type FetchPage } from './client';
import type { TdProduct, TdProductsResponse } from './types';

const cfg = { token: 't', feedId: 'f' };
const prod = (ean: string): TdProduct => ({
  name: `Portátil ${ean}`,
  productUrl: `https://x/${ean}`,
  identifiers: { ean },
});

describe('enumerateLaptops', () => {
  it('pagina hasta agotar totalHits y une keywords deduplicando por EAN', async () => {
    // Cada keyword devuelve 2 productos en page 1; 'a' y 'b' comparten EAN '1'.
    const fetchPage: FetchPage = vi.fn(async (_c, keyword, page) => {
      if (page > 1) return { products: [], productHeader: { totalHits: 2 } };
      const map: Record<string, TdProductsResponse> = {
        a: { products: [prod('1'), prod('2')], productHeader: { totalHits: 2 } },
        b: { products: [prod('1'), prod('3')], productHeader: { totalHits: 2 } },
      };
      return map[keyword] ?? { products: [] };
    });

    const out = await enumerateLaptops(cfg, { keywords: ['a', 'b'], pageSize: 2, fetchPage });
    expect(out.map((p) => p.identifiers?.ean).sort()).toEqual(['1', '2', '3']);
  });

  it('para cuando la página viene incompleta (menos que pageSize)', async () => {
    const fetchPage: FetchPage = vi.fn(async () => ({ products: [prod('1')] })); // 1 < pageSize
    const out = await enumerateLaptops(cfg, { keywords: ['a'], pageSize: 5, fetchPage });
    expect(out).toHaveLength(1);
    expect(fetchPage).toHaveBeenCalledTimes(1); // no pide page 2
  });

  it('respeta maxPerKeyword', async () => {
    const fetchPage: FetchPage = vi.fn(async () => ({
      products: [prod(String(Math.random()))], // siempre 1, nunca se agota por tamaño
      productHeader: { totalHits: 9999 },
    }));
    await enumerateLaptops(cfg, { keywords: ['a'], pageSize: 1, maxPerKeyword: 3, fetchPage });
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it('un error en una página no es fatal: corta esa keyword y sigue', async () => {
    const fetchPage: FetchPage = vi.fn(async (_c, keyword) => {
      if (keyword === 'a') throw new Error('boom');
      return { products: [prod('9')] };
    });
    const out = await enumerateLaptops(cfg, { keywords: ['a', 'b'], pageSize: 5, fetchPage });
    expect(out.map((p) => p.identifiers?.ean)).toEqual(['9']);
  });

  it('conserva productos sin EAN (no se deduplican)', async () => {
    const noEan: TdProduct = { name: 'x', productUrl: 'https://x' };
    const fetchPage: FetchPage = vi.fn(async () => ({ products: [noEan, noEan] }));
    const out = await enumerateLaptops(cfg, { keywords: ['a'], pageSize: 5, fetchPage });
    expect(out).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Ejecutar los tests para verificar que fallan**

Run: `npx vitest run lib/tradedoubler/client.test.ts`
Expected: FAIL (`enumerateLaptops` no exportada)

- [ ] **Step 3: Implementar `enumerateLaptops`**

En `lib/tradedoubler/client.ts`: añadir el import de `sleep` arriba y todo lo nuevo al final (no tocar `searchProductsByEan`).

Añadir a los imports del principio:

```ts
import { setTimeout as sleep } from 'node:timers/promises';
```

Añadir al final del archivo:

```ts
// Keywords por defecto para acotar a portátiles (el feed es todo el catálogo de
// MediaMarkt y la API corta a 1000 resultados por búsqueda → hay que filtrar).
export const DISCOVER_KEYWORDS = ['portatil', 'laptop', 'notebook', 'macbook'] as const;

// Fuente de una página de resultados. Inyectable para tests y para el modo --mock.
export type FetchPage = (
  cfg: TradedoublerConfig,
  keyword: string,
  page: number,
  pageSize: number,
) => Promise<TdProductsResponse>;

export type EnumerateOpts = {
  keywords?: readonly string[]; // default: DISCOVER_KEYWORDS
  pageSize?: number; // default: 60
  maxPerKeyword?: number; // tope de seguridad; default: 1000 (límite de la API)
  delayMs?: number; // sleep entre páginas reales; default: 1100
  fetchPage?: FetchPage; // default: fetch real
};

async function fetchPageReal(
  cfg: TradedoublerConfig,
  keyword: string,
  page: number,
  pageSize: number,
): Promise<TdProductsResponse> {
  const fid = encodeURIComponent(cfg.feedId);
  const q = encodeURIComponent(keyword);
  const url =
    `https://api.tradedoubler.com/1.0/products.json;fid=${fid};q=${q};pageSize=${pageSize};page=${page}` +
    `?token=${encodeURIComponent(cfg.token)}`;
  const res = await fetch(url);
  const json = (await res.json().catch(() => ({}))) as TdProductsResponse;
  if (!res.ok) {
    throw new Error(`Tradedoubler ${res.status}: ${JSON.stringify(json).slice(0, 150)}`);
  }
  return json;
}

/**
 * Enumera productos del feed acotando por keyword (varias pasadas) y deduplicando por
 * EAN. Para de paginar cuando la página viene vacía/incompleta, se alcanza `totalHits`
 * o `maxPerKeyword`. Un error de página no es fatal: corta esa keyword y sigue.
 */
export async function enumerateLaptops(
  cfg: TradedoublerConfig,
  opts: EnumerateOpts = {},
): Promise<TdProduct[]> {
  const keywords = opts.keywords ?? DISCOVER_KEYWORDS;
  const pageSize = opts.pageSize ?? 60;
  const maxPerKeyword = opts.maxPerKeyword ?? 1000;
  const delayMs = opts.delayMs ?? 1100;
  const fetchPage = opts.fetchPage ?? fetchPageReal;
  const isReal = opts.fetchPage == null;

  const byEan = new Map<string, TdProduct>();
  const withoutEan: TdProduct[] = [];

  for (const keyword of keywords) {
    let count = 0;
    for (let page = 1; ; page++) {
      let resp: TdProductsResponse;
      try {
        resp = await fetchPage(cfg, keyword, page, pageSize);
      } catch (e) {
        console.warn(`enumerateLaptops "${keyword}" p${page}: ${(e as Error).message.slice(0, 80)}`);
        break;
      }
      const products = resp.products ?? [];
      if (products.length === 0) break;
      for (const p of products) {
        const ean = p.identifiers?.ean;
        if (ean) {
          if (!byEan.has(ean)) byEan.set(ean, p);
        } else {
          withoutEan.push(p);
        }
        count++;
      }
      const total = resp.productHeader?.totalHits;
      if (count >= maxPerKeyword) break;
      if (total != null && page * pageSize >= total) break;
      if (products.length < pageSize) break; // última página parcial
      if (isReal) await sleep(delayMs); // rate-limit solo en red real
    }
  }

  return [...byEan.values(), ...withoutEan];
}
```

- [ ] **Step 4: Ejecutar los tests para verificar que pasan**

Run: `npx vitest run lib/tradedoubler/client.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/tradedoubler/client.ts lib/tradedoubler/client.test.ts
git commit -m "feat(tradedoubler): enumerateLaptops (paginación por keyword + dedup EAN)"
```

---

### Task 4: Mock de enumeración

**Files:**
- Modify: `lib/tradedoubler/mock.ts`

- [ ] **Step 1: Añadir `mockEnumerateResponse`**

Añadir al final de `lib/tradedoubler/mock.ts` (no tocar `mockProductsResponse`):

```ts
/**
 * Página simulada para `enrich:mediamarkt --discover --mock`. En `page === 1` devuelve:
 * un portátil nuevo (EAN no en catálogo → "created"), un accesorio (categoría Fundas →
 * "skipped" por isLaptopProduct) y los `existingEans` mapeados a portátiles (→ "attached").
 * En `page > 1` devuelve vacío para que la enumeración pare.
 */
export function mockEnumerateResponse(
  keyword: string,
  page: number,
  _pageSize: number,
  existingEans: string[] = [],
): TdProductsResponse {
  if (page > 1) return { products: [], productHeader: { totalHits: 0 } };

  const laptop = (ean: string, name: string) => ({
    name,
    brand: 'Acer',
    categories: [{ name: 'Portátiles' }],
    productUrl: `https://clk.tradedoubler.com/click?url=https%3A%2F%2Fwww.mediamarkt.es%2Fdp%2F${ean}`,
    sourceProductUrl: `https://www.mediamarkt.es/dp/${ean}`,
    price: { value: '899.00', currency: 'EUR' },
    productImage: { url: `https://www.mediamarkt.es/img/${ean}.jpg` },
    identifiers: { ean },
    availability: 'in stock',
  });

  const products = [
    laptop('0000000000001', `Portátil nuevo ${keyword} (mock MediaMarkt)`),
    {
      name: 'Funda para portátil 15.6" (mock)',
      brand: 'Acer',
      categories: [{ name: 'Fundas y maletines' }],
      productUrl: 'https://clk.tradedoubler.com/click?url=https%3A%2F%2Fwww.mediamarkt.es%2Fdp%2Ffunda',
      price: { value: '19.99', currency: 'EUR' },
      identifiers: { ean: '0000000000002' },
      availability: 'in stock',
    },
    ...existingEans.map((ean) => laptop(ean, `Portátil existente ${ean} (mock)`)),
  ];

  return { products, productHeader: { totalHits: products.length } };
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add lib/tradedoubler/mock.ts
git commit -m "feat(tradedoubler): mockEnumerateResponse para --discover --mock"
```

---

### Task 5: Wire `--discover` en el script + verificación manual

**Files:**
- Modify: `scripts/enrich-mediamarkt.ts`

- [ ] **Step 1: Añadir imports y el flag `--discover`**

En `scripts/enrich-mediamarkt.ts`, ampliar los imports de Tradedoubler y connectors (junto a los existentes):

```ts
import { configFromEnv, searchProductsByEan, enumerateLaptops } from '@/lib/tradedoubler/client';
import { mapProduct, pickByEan, toDiscovered } from '@/lib/tradedoubler/map-product';
import { mockProductsResponse, mockEnumerateResponse } from '@/lib/tradedoubler/mock';
import { discoverOrAttach } from '@/lib/connectors/discover';
```

Añadir la opción `discover` a `parseArgs` (junto a `limit`, `dry-run`, `mock`, `delay`):

```ts
    // Descubrimiento: enumera el feed por keyword y CREA laptops cuyo EAN no esté en
    // catálogo. Sin él, solo adjunta ofertas a los ya existentes (cruce por EAN).
    discover: { type: 'boolean', default: false },
```

Y la constante junto a las demás (`LIMIT`, `MOCK`, `DRY_RUN`, `DELAY`):

```ts
const DISCOVER = args.discover;
```

- [ ] **Step 2: Reflejar el flag en el log de cabecera**

Sustituir la línea de log de cabecera:

```ts
  console.log(`🛒 Conector MediaMarkt (mock=${MOCK}, dry-run=${DRY_RUN}, limit=${LIMIT})`);
```

por:

```ts
  console.log(
    `🛒 Conector MediaMarkt (mock=${MOCK}, dry-run=${DRY_RUN}, discover=${DISCOVER}, limit=${LIMIT})`,
  );
```

- [ ] **Step 3: Añadir la rama de descubrimiento**

Insertar este bloque en `main()` **justo después** de obtener `retailerId` (la asignación `const retailerId = DRY_RUN ? 'dry-run' : await getOrCreateRetailer(...)`) y **antes** de `const targets = await loadEanTargets(...)`:

```ts
  if (DISCOVER) {
    // Enumera el feed (real o mock) por keyword, dedup por EAN, y crea/adjunta.
    const existingEans = (await loadEanTargets(supabase, 3)).map((t) => t.ean);
    const dummyCfg = cfg ?? { token: 'mock', feedId: 'mock' };
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
      `\n✅ Descubrimiento: ${created} creados, ${attached} adjuntados (ya en catálogo), ${skipped} saltados.`,
    );
    return;
  }
```

- [ ] **Step 4: Verificar lint + typecheck**

Run: `npm run lint; npm run typecheck`
Expected: PASS ambos

- [ ] **Step 5: Verificación manual end-to-end (mock, sin red ni escritura)**

Run: `npm run enrich:mediamarkt -- --mock --dry-run --discover`
Expected: imprime `discover=true`, un número de productos enumerados > 0, y un resumen tipo `Descubrimiento: N creados, M adjuntados, K saltados` donde:
- al menos **1 creado** (el `0000000000001` nuevo, en dry),
- los `existingEans` reales aparecen como **adjuntados** (si el catálogo tiene EANs),
- al menos **1 saltado** (la funda).

No debe escribir nada (dry-run) ni requerir credenciales de Tradedoubler.

- [ ] **Step 6: Commit**

```bash
git add scripts/enrich-mediamarkt.ts
git commit -m "feat(mediamarkt): modo --discover (crea laptops nuevos del feed de Tradedoubler)"
```

---

### Task 6: Suite completa + cierre

- [ ] **Step 1: Ejecutar lint + typecheck + tests (lo que corre CI)**

Run: `npm run lint; npm run typecheck; npm test`
Expected: PASS — todos los tests verdes (incluidos los nuevos de Tasks 2 y 3).

- [ ] **Step 2: (No commit aquí si no hay cambios)** — si algún paso anterior dejó algo sin commitear, hacerlo ahora con un mensaje conventional acorde.

---

## Notas de implementación

- **No tocar** `discoverOrAttach`, `upsert-offer`, `searchProductsByEan`, `mapProduct`, `pickByEan` ni el modo attach-by-EAN del script.
- **CRLF**: no correr `prettier --write` (ensucia el diff); CI solo corre `eslint` + `tsc` + `vitest`.
- **Gating**: el modo real sigue requiriendo `TRADEDOUBLER_TOKEN`/`TRADEDOUBLER_FEED_ID`; `--mock` fuerza `--dry-run` y no necesita esas credenciales (sí las de Supabase, como hoy).
- **PR**: rama `feat/descubrimiento-mediamarkt`; al cerrar, nota de vault (addendum en `30-mediamarkt-elcorteingles` o nueva) + bitácora, según convención.
