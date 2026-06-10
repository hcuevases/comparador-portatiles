-- 0025_dedup_ean.sql
-- Fundación de deduplicación del catálogo: identificadores universales de producto.
--
-- ean: código de barras EAN/GTIN (de Algolia, ~99% cobertura). Es la clave para casar
--   el MISMO producto entre fuentes (PcComponentes ↔ Amazon, que también expone EAN).
-- mpn: referencia del fabricante (100% en Algolia). Fallback cuando no hay EAN.
--
-- La entrada de catálogo se identifica por (ean, refurbished): el mismo EAN aparece en
-- el par nuevo/reacondicionado (mismo producto físico, distinta condición), que SÍ son
-- entradas separadas. El índice ÚNICO parcial sobre (ean, refurbished) se añade en una
-- migración posterior, tras el backfill y resolver colisiones reales si las hubiera.
--
-- El esquema ya soporta múltiples retailers por laptop (affiliate_links/prices_history
-- con retailer_id); esto solo añade la clave de match para no duplicar al ingerir una
-- segunda fuente.

alter table public.laptops add column if not exists ean text;
alter table public.laptops add column if not exists mpn text;

create index if not exists laptops_ean_idx on public.laptops (ean) where ean is not null;
create index if not exists laptops_mpn_idx on public.laptops (mpn) where mpn is not null;
