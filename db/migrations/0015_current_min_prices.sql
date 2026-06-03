-- 0015_current_min_prices.sql
-- RPC `current_min_prices(ids)`: precio ACTUAL por portátil (último precio por
-- retailer → mínimo entre retailers), para un conjunto de ids.
--
-- Centraliza la definición de "precio actual" que hasta ahora vivía duplicada en
-- 3 sitios (la RPC search_laptops, la ficha en TS, /comparar en TS). La usan las
-- alertas de precio (#0016) — y se puede migrar la ficha/comparar a ella más
-- adelante para tener una única fuente.
--
-- security invoker → respeta la RLS de lectura pública de prices_history.

create or replace function public.current_min_prices(p_ids uuid[])
returns table (laptop_id uuid, min_price numeric)
language sql
stable
security invoker
set search_path = public
as $$
  with latest_per_retailer as (
    select distinct on (ph.laptop_id, ph.retailer_id)
      ph.laptop_id, ph.price_eur
    from public.prices_history ph
    where ph.laptop_id = any (p_ids)
    order by ph.laptop_id, ph.retailer_id, ph.observed_at desc
  )
  select lpr.laptop_id, min(lpr.price_eur) as min_price
  from latest_per_retailer lpr
  group by lpr.laptop_id;
$$;

grant execute on function public.current_min_prices(uuid[]) to anon, authenticated;
