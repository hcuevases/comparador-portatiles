-- 0045_clean_outlier_prices.sql
-- Limpieza one-shot del precio-alto-erróneo del histórico (ver spec / lib/price-guard).
-- Por (portátil, retailer): referencia = mediana de los últimos 14 días (>=3 puntos); SOLO si los
-- precios recientes son estables (max/min < 1.8, para no tocar rebajas/subidas reales recientes);
-- se borran los puntos MÁS VIEJOS que 14 días con price_eur > referencia * 1.8.
-- Idempotente (re-ejecutar no borra de más). Consistente con 0037_clean_sentinel_prices (#87).

with recent as (
  select
    laptop_id,
    retailer_id,
    percentile_cont(0.5) within group (order by price_eur) as ref_median,
    max(price_eur) as rmax,
    min(price_eur) as rmin,
    count(*) as n
  from public.prices_history
  where observed_at >= now() - interval '14 days'
  group by laptop_id, retailer_id
  having count(*) >= 3
),
targets as (
  -- recientes estables: descarta portátiles en rebaja/subida real reciente.
  select laptop_id, retailer_id, ref_median
  from recent
  where rmax / nullif(rmin, 0) < 1.8
)
delete from public.prices_history ph
using targets t
where ph.laptop_id = t.laptop_id
  and ph.retailer_id = t.retailer_id
  and ph.observed_at < now() - interval '14 days'
  and ph.price_eur > t.ref_median * 1.8;
