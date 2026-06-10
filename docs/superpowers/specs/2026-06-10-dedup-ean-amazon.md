# Deduplicación del catálogo (EAN) + base para Amazon — Diseño

**Fecha:** 2026-06-10
**Estado:** en implementación (fundación de dedup). Conector Amazon diferido.
**Sub-proyecto:** (3) de la tanda. Sigue a benchmarks (2) y a la extensión de pantalla.

## Objetivo

Poder añadir una segunda fuente de ofertas (Amazon, para enlaces de afiliado) **sin
duplicar portátiles** en el catálogo. Para eso hace falta una clave que identifique el
mismo producto entre fuentes.

## Hallazgo decisivo

Algolia (PcComponentes) **ya expone `ean`** (código de barras EAN/GTIN, ~99% cobertura)
y `mpn`/`partNumber` (100%) por producto, y no los capturábamos. **Amazon también
expone EAN** (PA-API, `ExternalIds.EANs`). Por tanto el dedup puede ser **exacto por
EAN**, no fuzzy por nombre.

Los EAN repetidos en el catálogo (≈16% en muestra) son **pares nuevo/reacondicionado**
del mismo producto (mismo objectID base con sufijos `#new`/`#reac`, `isRefurbished`
distinto, mismo EAN) → entradas legítimamente separadas. Por eso la clave de entrada de
catálogo es **(ean, refurbished)**, no `ean` a secas.

## Decisiones

- **Clave de identidad: `(ean, refurbished)`.** Fallback `mpn`, y marca+modelo
  normalizado para el ~1% sin EAN.
- El esquema **no cambia de forma** (ya hay `affiliate_links`/`prices_history` con
  `retailer_id` → múltiples retailers por laptop). Solo se añade la clave de match.
- **Capturar y poblar ahora** (Algolia es accesible, sin Cloudflare). El conector real
  de Amazon (PA-API) se difiere: necesita cuenta Associates aprobada (~3 ventas/180d).

## Alcance de este ciclo

1. `laptops.ean` + `laptops.mpn` (migración 0025) + índices.
2. `scrape-catalog` captura `ean`/`mpn` (`mapHit` + upsert) y modo `--ean-only` para
   backfill por slug sin tocar precios/specs ni crear productos.
3. **Backfill** del catálogo (~4000) vía `--ean-only --by-brand`.
4. **Integridad**: detectar colisiones reales `(ean, refurbished)`; si las hay,
   reportar/resolver; añadir índice ÚNICO parcial (migración 0026).
5. Documentar la **lógica de ingesta de Amazon** (match por `(ean, refurbished)` →
   adjuntar oferta a la laptop existente o crear nueva).

## Fuera de alcance (diferido)

- Conector de Amazon PA-API (cuenta Associates). Cuando exista, se enchufa a la lógica
  de match por EAN ya preparada.
- UI: el EAN/MPN no es necesariamente visible al usuario (es clave interna); no se
  añade a la ficha en este ciclo.

## Lógica de ingesta de Amazon (preparada, para cuando haya cuenta)

```
para cada oferta de Amazon (con su EAN):
  laptop = SELECT * FROM laptops WHERE ean = <ean> AND refurbished = false
  si laptop existe:
     upsert affiliate_links (laptop_id, retailer='amazon', url con tag de afiliado)
     insert prices_history (laptop_id, retailer='amazon', price)
  si no:
     (opcional) crear laptop nueva desde los datos de Amazon, o saltar si solo
     queremos enriquecer ofertas de productos ya en catálogo.
```

Amazon aporta sobre todo **oferta/precio + enlace de afiliado**; sus specs son pobres,
así que las specs siguen viniendo de Algolia/ficha. El EAN evita el duplicado.

## Riesgos

- ~1% sin EAN: quedan sin clave fuerte; fallback mpn/nombre (menos fiable). Aceptable.
- Colisiones `(ean, refurbished)` reales (mismo producto+condición listado dos veces):
  se detectan en el paso 4 antes de imponer el único; si aparecen, se resuelven
  (merge/borrado del duplicado) — el esquema y el cascade lo permiten.
