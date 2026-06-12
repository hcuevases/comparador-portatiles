# Conector Amazon (PA-API 5.0) — diseño

**Fecha:** 2026-06-12 · **Estado:** esqueleto construido, **gateado a la espera de credenciales de Amazon Associates**.

## Objetivo

Añadir Amazon como **segunda fuente** de precio + enlace de afiliado para portátiles **que ya existen** en el catálogo, casándolos por **EAN** (`laptops.ean` ↔ PA-API). No crea productos nuevos: si el EAN no está ya en BD, se ignora. Coherente con la fundación de dedup por EAN (migración 0025).

## Arquitectura

Sigue las convenciones del repo: lógica pura y testeable en `lib/`, job en `scripts/`, `fetch` nativo sin SDK, escritura con service-role, `--dry-run`.

| Pieza | Responsabilidad |
|---|---|
| `lib/amazon/types.ts` | Tipos del subset de PA-API que consumimos + `MappedOffer` |
| `lib/amazon/sign.ts` | Firma **AWS SigV4** (pura, `node:crypto`). Validada contra el vector oficial `get-vanilla` de AWS en `sign.test.ts` |
| `lib/amazon/map-item.ts` | `mapItem` (item → oferta normalizada) y `pickItemByEan` (elige el item cuyo EAN coincide). Puro, testeado |
| `lib/amazon/client.ts` | `getItemsByAsin` / `searchItemsByEan`: arma payload, firma, `fetch`. `configFromEnv()` devuelve null sin credenciales |
| `lib/amazon/mock.ts` | Respuesta PA-API simulada para `--mock` |
| `scripts/enrich-amazon.ts` | Orquestación: carga objetivos por EAN → (ASIN cacheado? GetItems : SearchItems) → mapea → upsert `affiliate_links` + insert `prices_history` |
| `db/migrations/0027_affiliate_asin.sql` | Añade `affiliate_links.asin` (cache EAN→ASIN) |

## Flujo de datos

```
laptop(ean, refurbished=false)
  └─ ¿asin cacheado en affiliate_links? ── sí ─→ GetItems(ASIN)
                                          └ no ─→ SearchItems(Keywords=EAN) → pickItemByEan
        └─ mapItem → { asin, priceEur, url, inStock }
              ├─ upsert affiliate_links (url, asin, active)   [onConflict laptop_id,retailer_id]
              └─ insert prices_history (price_eur, in_stock)  [solo si priceEur != null]
```

## Decisiones

- **Match por EAN**, no por ASIN manual: reutiliza la clave de dedup existente. La primera vez resuelve EAN→ASIN (SearchItems) y **cachea el ASIN** para usar GetItems directo después (menos llamadas — PA-API limita a ~1 req/s + cuota diaria; `--delay` default 1100ms).
- **Solo precio en EUR** entra en `prices_history` (marketplace `.es`). Si la oferta no está en EUR, se guarda el enlace pero no el precio.
- **Moneda/host/region por defecto** = España (`webservices.amazon.es`, `eu-west-1`, `www.amazon.es`), sobreescribibles por env.
- **`--mock` fuerza `--dry-run`**: nunca se escriben ofertas simuladas en producción.

## Testeable hoy sin credenciales

- `sign.test.ts` valida la firma contra el vector oficial de AWS.
- `map-item.test.ts` cubre el mapeo y la selección por EAN.
- `npm run enrich:amazon -- --mock --dry-run` ejercita el pipeline completo (carga real + mapeo + writes simulados).

## Pendiente (cuando haya cuenta Associates aprobada)

Rellenar en `.env.local`: `AMAZON_ACCESS_KEY`, `AMAZON_SECRET_KEY`, `AMAZON_PARTNER_TAG`. Nada de código.

> ⚠️ La firma y el cliente siguen la documentación de PA-API pero **no están validados contra el endpoint real** (requiere credenciales). Primer paso al activarse: `npm run enrich:amazon -- --limit 3 --dry-run` y revisar la respuesta real.

## Seguimiento

Registrado en el vault (convención del repo, fuera de este repo): **ADR-007-amazon-paapi** + nota técnica `29-amazon-paapi`.
