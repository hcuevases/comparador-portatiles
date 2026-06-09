-- 0021_fix_refurbished_flag.sql
-- Corrige el flag `refurbished` de productos reacondicionados que estaban marcados
-- como nuevos. El backfill de 0009 solo cogía slugs que ACABAN en "-refurbished"; los
-- "Dell Replay", los que llevan "reacondicionado" en el nombre, etc. se escapaban → y
-- se colaban en el filtro "solo nuevos" (0020) del asistente IA. Detectados 9.
--
-- (El scraper sigue derivando refurbished del slug; ampliar su detección a estos casos
--  queda como mejora futura para que no reaparezcan.)
update public.laptops
set refurbished = true
where not refurbished
  and (
    slug ilike '%refurbished%' or slug ilike '%reacond%'
    or model ilike '%refurb%' or model ilike '%reacond%' or model ilike '%replay%'
  );
