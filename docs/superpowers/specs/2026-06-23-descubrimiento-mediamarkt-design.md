# Diseño: descubrimiento de MediaMarkt (enumerar el feed de Tradedoubler)

**Fecha:** 2026-06-23
**Estado:** aprobado (pendiente de revisión del spec por el usuario)

## Problema

El conector de MediaMarkt (`scripts/enrich-mediamarkt.ts`, vía la Products API de
Tradedoubler) hoy solo **adjunta** ofertas a portátiles que YA existen en catálogo,
consultando por EAN uno a uno (`searchProductsByEan`). No **descubre**: no crea
laptops nuevos que estén en MediaMarkt pero no en PcComponentes.

El Corte Inglés (#72) ya hace descubrimiento porque Awin entrega un **feed CSV
completo** (se descarga entero y se recorre). MediaMarkt no: Tradedoubler es una API
REST paginada. Falta la pieza de **enumeración** para poder reutilizar el núcleo de
descubrimiento ya existente. El commit de #72 lo dejó apuntado como fast-follow:
"descubrimiento de MediaMarkt (enumerar el feed de Tradedoubler) con el mismo núcleo".

## Investigación de la API (Products API de Tradedoubler, publisher)

Doc oficial: <https://dev.tradedoubler.com/products/publisher/>. Hallazgos que
condicionan el diseño:

- **Matrix params** (en la ruta, no query string): `;fid=` (feed), `;q=` (keyword
  full-text contra título+descripción, admite múltiples valores), `;brand=`,
  `;ean=`, `;category=` / `;tdCategoryId=`, `;language=`, y paginación `;page=` +
  `;pageSize=` (o `;limit=`). El `token` va como query param.
- Ejemplo verbatim de la doc:
  `HTTP[S] GET http://api.tradedoubler.com/1.0/products;fid={feedId};q=laptop?token={token}`
- Respuesta JSON: `productHeader.totalHits` (Integer) + `products[]`, con campos
  `name`, `description`, `price` (Float / `{value,currency}`), `productUrl`,
  `sourceProductUrl`, `productImage.url`, `categories[] = {id,name,tdCategoryName}`,
  `identifiers = {ean,sku,upc,isbn,mpn}`, `brand`, `manufacturer`, `model`,
  `availability`, `condition`, `inStock`.
- **Límite duro: máximo 1.000 productos por búsqueda.** → Enumerar el catálogo
  entero de MediaMarkt (TVs, electrodomésticos…) es inviable: la API lo cortaría a
  1.000 productos arbitrarios. **Filtrar por keyword en la API es obligatorio**, no
  una optimización.

**Caveat (ADR-008):** sin cuenta de publisher Tradedoubler aprobada + alta en
MediaMarkt, no se puede verificar en vivo que el feed de producto exista ni que
estos parámetros se comporten exactamente así. El código se basa en la doc oficial
y queda gateado; al tener cuenta puede requerir ajustar constantes (keywords,
pageSize), no la arquitectura.

## Decisiones

1. **Acotar a portátiles por keyword en la API + red de seguridad en cliente.**
   Pasadas separadas por keyword (`portatil`, `laptop`, `notebook`, `macbook`),
   **dedup por EAN** al unir, y cada producto pasa además por `isLaptopProduct`
   (ya existe) como red de seguridad contra accesorios. Se eligió frente a:
   - enumerar todo y filtrar en cliente (el tope de 1.000 lo hace inviable);
   - `tdCategoryId` (id de categoría específico del anunciante, no verificable sin
     cuenta).
   `;q=` admite múltiples valores pero la doc no aclara si combina AND u OR; pasadas
   separadas + dedup es el comportamiento predecible.
2. **Reutilizar `discoverOrAttach` sin tocarlo.** El núcleo de descubrimiento ya es
   genérico (recibe un `DiscoveredProduct`); solo cambia la fuente.
3. **Gated + mock**, igual que el resto de conectores. `--mock` fuerza `--dry-run`.
4. **Manual, sin cron.** El descubrimiento es una operación de poblado puntual
   (además gateada); no se añade a `affiliate-prices-cron.yml`.

## Arquitectura

```
enrich-mediamarkt.ts --discover
        │
        ├─ enumerateLaptops(cfg, opts)        (lib/tradedoubler/client.ts)
        │     └─ por keyword: pagina fid;q=kw;page;pageSize → dedup por EAN
        │
        ├─ toDiscovered(tdProduct)            (lib/tradedoubler/map-product.ts)
        │     └─ TdProduct → DiscoveredProduct (ean,name,brand,category,imageUrl,offer)
        │
        └─ discoverOrAttach(supabase, retailerId, discovered, {dryRun})   (SIN cambios)
              └─ crea / adjunta / salta
```

### 1. Cliente — `lib/tradedoubler/client.ts`

Nueva función junto a `searchProductsByEan` (que no se toca):

```ts
const DISCOVER_KEYWORDS = ['portatil', 'laptop', 'notebook', 'macbook'] as const;

export type EnumerateOpts = {
  keywords?: readonly string[];   // default: DISCOVER_KEYWORDS
  pageSize?: number;              // default: 60
  maxPerKeyword?: number;         // tope de seguridad, default: 1000 (límite de la API)
  delayMs?: number;               // sleep entre páginas, default: 1100 (como hoy)
  // Inyectable para tests/mock: trae una página cruda. Default: fetch real.
  fetchPage?: (cfg: TradedoublerConfig, keyword: string, page: number, pageSize: number)
    => Promise<TdProductsResponse>;
};

export async function enumerateLaptops(
  cfg: TradedoublerConfig,
  opts?: EnumerateOpts,
): Promise<TdProduct[]>;
```

- Por cada keyword: pide `page=1..N` con `pageSize`, parando cuando se agotan los
  resultados (`products` vacío o se alcanza `productHeader.totalHits`) o se llega a
  `maxPerKeyword`. `sleep(delayMs)` entre páginas reales.
- Une los productos de todas las keywords **deduplicando por `identifiers.ean`**
  (los sin EAN se conservan; `discoverOrAttach`/`toDiscovered` ya los descartan).
- La URL de la página real reusa el estilo de `searchProductsByEan`:
  `…/1.0/products.json;fid=<fid>;q=<kw>;pageSize=<n>;page=<p>?token=<token>`, con el
  mismo manejo de error HTTP (`res.ok` → throw con cuerpo recortado).

### 2. Tipos — `lib/tradedoubler/types.ts`

Ampliar (todo opcional, la API omite campos sin datos):

```ts
export type TdCategory = { name?: string };
export type TdProduct = {
  // …campos actuales…
  brand?: string;
  categories?: TdCategory[];
};
export type TdProductsResponse = {
  products?: TdProduct[];
  productHeader?: { totalHits?: number };
};
```

### 3. Mapeo — `lib/tradedoubler/map-product.ts`

Nueva función pura (junto a `mapProduct`/`pickByEan`, que no se tocan):

```ts
export function toDiscovered(p: TdProduct): DiscoveredProduct | null;
```

- `ean = p.identifiers?.ean`; si falta → `null` (no se puede dedup ni casar).
- `offer = mapProduct(p)`; si `null` (sin `productUrl`) → `null`.
- `name = p.name ?? ''`, `brand = p.brand ?? null`,
  `category = p.categories?.[0]?.name ?? null`, `imageUrl = p.productImage?.url ?? null`.
- Devuelve `DiscoveredProduct` (tipo ya exportado por `discover.ts`).

### 4. Script — `scripts/enrich-mediamarkt.ts`

Añadir `--discover` (mismo patrón que `enrich-elcorteingles.ts`):

- **Sin `--discover`** (comportamiento actual): adjunta por EAN a existentes. Sin cambios.
- **Con `--discover`**:
  1. Obtener la lista enumerada de productos con **una sola** ruta de código,
     `enumerateLaptops(cfg, opts)`, cambiando solo la **fuente** (igual que ECI
     cambia `downloadFeed` por `mockFeedCsv` pero reusa `parseAwinFeed`):
     - real: `await enumerateLaptops(cfg, { … })` (usa `fetchPage` real interno);
     - `--mock`: `await enumerateLaptops(dummyCfg, { delayMs: 0, fetchPage:
       (_cfg, kw, page, size) => mockEnumerateResponse(kw, page, size, existingEans) })`,
       con `existingEans` = unos pocos EANs de catálogo para ejercitar "attached".
       Así se reutiliza la paginación + dedup por EAN sin duplicarlas y sin red.
  2. Por cada producto: `d = toDiscovered(p)`; si `null`, cuenta como saltado.
  3. `discoverOrAttach(supabase, retailerId, d, { dryRun: DRY_RUN })`.
  4. Respeta `--limit` (corta la lista enumerada), `--dry-run`, `--mock`.
  5. Resumen: `creados / adjuntados (ya en catálogo) / saltados (no portátil o sin datos)`.

El parámetro `fetchPage` de `EnumerateOpts` es el punto de inyección de la fuente:
lo usa tanto el `--mock` del script como los unit-tests de paginación/dedup (sin red).

### 5. Mock — `lib/tradedoubler/mock.ts`

Añadir junto a `mockProductsResponse` (que no se toca):

```ts
export function mockEnumerateResponse(
  keyword: string, page: number, pageSize: number, existingEans?: string[],
): TdProductsResponse;
```

- `page === 1`: devuelve un puñado de productos con `categories`, `brand`,
  `productImage` y `productHeader.totalHits`, incluyendo:
  - 1-2 EANs **no existentes** en catálogo (hardcodeados; ejercita "created"),
  - los `existingEans` mapeados a productos portátil (ejercita "attached"),
  - 1 accesorio (categoría "Fundas") para ejercitar el filtro `isLaptopProduct`.
- `page > 1`: devuelve `products: []` para que la enumeración pare (catálogo simulado
  pequeño, cabe en una página).

## Manejo de errores

- Sin credenciales y sin `--mock`: error claro al inicio (como hoy).
- Error HTTP en una página: log recortado y se continúa con la siguiente keyword (no
  fatal), consistente con el conector actual.
- Productos sin EAN o sin `productUrl`: `toDiscovered` devuelve `null` → saltados, no
  rompen.

## Tests (Vitest)

- `toDiscovered`: mapeo completo; descartes (sin EAN, sin url); `category` desde
  `categories[0].name`.
- `enumerateLaptops`: con un `fetchPage` simulado (sin red) — paginación (para al
  vaciarse / al alcanzar `maxPerKeyword`), unión de varias keywords con **dedup por
  EAN**, respeto de `pageSize`.
- `mapProduct` y `discoverOrAttach` ya están cubiertos; no se duplican.
- Verificación manual end-to-end: `npm run enrich:mediamarkt -- --mock --dry-run --discover`
  debe reportar creados/adjuntados/saltados coherentes con el mock. Sin BD en CI.

## No-objetivos

- Tocar `discoverOrAttach`, `upsert-offer` o el modo attach-by-EAN.
- Cron/scheduling del descubrimiento.
- Enriquecer specs de los laptops creados (lo hace `enrich:specs` aparte).
- Descubrimiento por `tdCategoryId`.
- Confirmar la existencia real del feed de MediaMarkt (depende de la cuenta; ADR-008).
