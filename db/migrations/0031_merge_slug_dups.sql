-- 0031_merge_slug_dups.sql
-- Fusión de filas duplicadas por un cambio de formato de slug del scraper (sub-proyecto A).
-- Histórico: el scraper cambió cómo genera el slug (15,6" → antes "156", ahora "15-6").
-- El slug es la clave de upsert, así que al cambiar creó filas NUEVAS en vez de actualizar
-- las viejas. La vieja quedó sin EAN/MPN y el job de descatalogación (0028) la ocultó
-- (discontinued_at); la nueva está activa con EAN/MPN. Misma máquina física, dos filas.
--
-- Criterio CONSERVADOR de fusión (mapping 1-a-1, verificado): grupos (brand, model) idéntico,
-- no reacondicionado, con EXACTAMENTE 1 canónica (discontinued_at is null AND ean is not null)
-- y >=1 vieja (discontinued_at is not null AND ean is null). Cada vieja → esa canónica.
-- En el momento de escribir: 151 viejas → 151 canónicas, 829 filas de prices_history a mover,
-- 0 price_alerts y 0 comparisons afectadas.
--
-- Se PRESERVA el histórico de precios (se reasigna a la canónica antes de borrar; si no, el
-- cascade lo borraría). Las specs y affiliate_links de la vieja sí se van con el cascade
-- (la canónica ya tiene los suyos, más ricos). Idempotente: tras correr, no quedan pares que
-- casen el patrón → re-ejecutar no afecta filas.

-- 1) Reasignar el histórico de precios de cada vieja a su canónica.
with grp as (
  select brand, model,
    count(*) filter (where discontinued_at is null and ean is not null) as canon_ct,
    count(*) filter (where discontinued_at is not null and ean is null) as stale_ct
  from public.laptops
  where refurbished = false
  group by brand, model
),
eligible as (
  select brand, model from grp where canon_ct = 1 and stale_ct >= 1
),
mapping as (
  select s.id as old_id, c.id as new_id
  from eligible e
  join public.laptops s
    on s.brand = e.brand and s.model = e.model
   and s.refurbished = false and s.discontinued_at is not null and s.ean is null
  join public.laptops c
    on c.brand = e.brand and c.model = e.model
   and c.refurbished = false and c.discontinued_at is null and c.ean is not null
)
update public.prices_history ph
set laptop_id = m.new_id
from mapping m
where ph.laptop_id = m.old_id;

-- 2) Borrar las filas viejas (cascade retira sus specs + affiliate_links; el histórico ya se movió).
with grp as (
  select brand, model,
    count(*) filter (where discontinued_at is null and ean is not null) as canon_ct,
    count(*) filter (where discontinued_at is not null and ean is null) as stale_ct
  from public.laptops
  where refurbished = false
  group by brand, model
),
eligible as (
  select brand, model from grp where canon_ct = 1 and stale_ct >= 1
),
mapping as (
  select s.id as old_id
  from eligible e
  join public.laptops s
    on s.brand = e.brand and s.model = e.model
   and s.refurbished = false and s.discontinued_at is not null and s.ean is null
  join public.laptops c
    on c.brand = e.brand and c.model = e.model
   and c.refurbished = false and c.discontinued_at is null and c.ean is not null
)
delete from public.laptops l
using mapping m
where l.id = m.old_id;
