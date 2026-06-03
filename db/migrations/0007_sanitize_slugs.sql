-- 0007_sanitize_slugs.sql
-- Sanea los slugs no URL-safe de `laptops`.
--
-- PROBLEMA: Algolia incluye el query param de PcComponentes dentro del campo
-- `slug` para los productos reacondicionados (p.ej.
-- "...-windows-11-home?refurbished"). El `?` parte la URL y rompe nuestra ruta
-- /portatiles/[slug] → esas 136 fichas (de 622) daban notFound.
--
-- NO se puede simplemente quitar el query: 135 de los 136 reacondicionados
-- comparten el slug base con su versión nueva, así que strippear el `?` crearía
-- slugs duplicados. En su lugar convertimos el query en un sufijo con guion:
--   "...-home?refurbished"  ->  "...-home-refurbished"
-- URL-safe y único (verificado: 0 colisiones con slugs existentes).
--
-- Misma transformación que `sanitizeSlug()` en scripts/scrape-catalog.ts: pasar
-- a minúsculas, sustituir cualquier carácter no [a-z0-9] por '-' (colapsando
-- runs) y recortar guiones de los extremos.
--
-- NO se tocan `affiliate_links.url`: ya guardan el `?refurbished` real, que es
-- el que enlaza al producto reacondicionado correcto en PcComponentes.
--
-- El resto de tablas referencian laptops por `laptop_id` (FK), no por slug, así
-- que cambiar el slug no afecta a specs/prices_history/affiliate_links/comparisons.
--
-- IDEMPOTENTE: el WHERE solo afecta a slugs que aún no son URL-safe; re-correrla
-- no cambia nada una vez saneados.

update public.laptops
set slug = trim(both '-' from regexp_replace(lower(slug), '[^a-z0-9]+', '-', 'g'))
where slug !~ '^[a-z0-9-]+$';
