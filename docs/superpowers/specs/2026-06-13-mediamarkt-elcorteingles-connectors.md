# Conectores MediaMarkt + El Corte Inglés — diseño

**Fecha:** 2026-06-13 · **Estado:** esqueletos construidos, **gateados a credenciales** de las redes de afiliación.

## Objetivo

Que la ficha muestre precio + enlace de afiliado de **las 4 webs** (PcComponentes, Amazon, MediaMarkt, El Corte Inglés). El front y el modelo de datos **ya son multi-retailer** (la ficha pinta `retailerCards.map(...)` ordenadas por precio, con "Ver oferta" y badge "Mejor precio"). Falta solo **ingestar** los dos nuevos retailers, casando por EAN.

## Investigación (resumen)

Ninguno tiene API propia tipo Amazon; van por red de afiliación con producto matcheable por EAN:

- **MediaMarkt España → Tradedoubler** (programa #270504, activo 2026). Products API REST consultable por EAN: `GET api.tradedoubler.com/1.0/products.json;fid={feed};ean={ean}?token={token}` → precio + Product URL ya trackeada. **No** está en Awin para España (solo AT/CH).
- **El Corte Inglés → Awin** (merchant #13075). Product feed (CSV/gzip) descargable: `productdata.awin.com/datafeed/download/apikey/...`; columnas `ean`, `search_price`, `aw_deep_link` (afiliado ya hecho), `in_stock`.

> ⚠️ **No verificable sin cuenta:** que cada comercio publique un *feed/catálogo de producto* consultable (≠ tener programa de tracking). La página del programa de MediaMarkt no anuncia feed. Solo se confirma dándose de alta como publisher. Por eso los conectores se construyen a la spec documentada pero **gateados**, y no se validan contra el endpoint real hasta tener credenciales (igual que la firma de Amazon).

## Arquitectura

Mismo patrón que Amazon: lógica pura testeable en `lib/`, job en `scripts/`, `fetch` nativo, `--dry-run`/`--mock`, match por EAN, no crea productos.

| Pieza | Responsabilidad |
|---|---|
| `lib/connectors/upsert-offer.ts` | **Compartido**: dado `(laptopId, retailerId, oferta)` → upsert `affiliate_links` + insert `prices_history`. Lo usan los 3 conectores |
| `lib/connectors/db.ts` | **Compartido**: `getOrCreateRetailer` + `loadEanTargets` (portátiles con EAN, no reacond.) |
| `lib/tradedoubler/{types,client,map-product,mock}.ts` | MediaMarkt: query por EAN + mapeo puro (`mapProduct`/`pickByEan`/`parsePrice`) |
| `scripts/enrich-mediamarkt.ts` | Job MediaMarkt (`enrich:mediamarkt`) |
| `lib/awin/{types,client,parse-feed,mock}.ts` | ECI: descarga+gunzip del feed + **parser CSV puro** (`parseCsv`/`parseAwinFeed`/`indexByEan`) |
| `scripts/enrich-elcorteingles.ts` | Job ECI (`enrich:elcorteingles`): descarga feed → indexa por EAN → cruza el catálogo |
| `scripts/enrich-amazon.ts` | Refactorizado para usar los helpers compartidos |

Sin migración: usan `affiliate_links`/`prices_history` ya existentes (`asin` queda null para MM/ECI).

## Verificable hoy sin cuentas

- Tests puros: `tradedoubler/map-product.test.ts` (mapeo + parsePrice), `awin/parse-feed.test.ts` (CSV + mapeo de columnas). Total repo: 73.
- `npm run enrich:mediamarkt -- --mock --dry-run` y `enrich:elcorteingles -- --mock --dry-run` ejercitan el pipeline completo sobre laptops reales.

## Pendiente para activar (cuando haya cuentas aprobadas)

- **MediaMarkt:** alta en Tradedoubler → aprobación de MediaMarkt → `TRADEDOUBLER_TOKEN` + `TRADEDOUBLER_FEED_ID`. **Confirmar que existe feed de producto** (mirar el `fid` en el índice).
- **El Corte Inglés:** alta en Awin → aprobación de ECI → `AWIN_API_KEY` + `AWIN_FEED_ID`. Confirmar que el feed existe y revisar la URL/columnas exactas de Create-a-Feed.
- Primer paso al activar cada uno: `--limit 3 --dry-run` y revisar la respuesta real.

## Seguimiento

Registrar **ADR-008-mediamarkt-elcorteingles** + nota técnica en el vault (convención del repo).
