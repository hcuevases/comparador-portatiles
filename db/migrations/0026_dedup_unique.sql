-- 0026_dedup_unique.sql
-- Impone la integridad de deduplicación: no puede haber dos entradas con el mismo
-- (ean, refurbished). El mismo EAN sí puede repetirse entre nuevo y reacondicionado
-- (par legítimo), pero no dentro de la misma condición.
--
-- ⚠️ Aplicar SOLO tras el backfill de EAN (0025 + scrape --ean-only) y tras verificar
-- que no hay colisiones reales:
--   select ean, refurbished, count(*) from public.laptops
--   where ean is not null group by 1,2 having count(*) > 1;
-- Si devuelve filas, resolverlas (merge/borrado del duplicado) ANTES de crear el índice.

create unique index if not exists laptops_ean_condition_uniq
  on public.laptops (ean, refurbished)
  where ean is not null;
