-- 0038_home_deals.sql
-- RPC para el feed de "Chollos" de la home: mayores bajadas de precio recientes.
-- Precio actual = último por retailer (dentro de la ventana) -> mínimo. Referencia = PERCENTIL
-- (mediana por defecto) del precio del portátil en la ventana, NO el máximo: el máximo es
-- sensible a un pico puntual/centinela (ver validar-precios-scrapeados). drop_pct =
-- (ref - actual) / ref * 100. Solo activos, con precio actual fresco (<=7 días) y bajada
-- entre p_min_drop_pct y p_max_drop_pct. El techo (30% por defecto) descarta la basura de
-- precio-alto-erróneo en rango (variante equivocada / MSRP sin-stock) que domina la ventana de
-- algunos portátiles y que ni mediana ni ventana filtran: las rebajas reales de portátil nuevo
-- rara vez pasan del 30%. El CTE que agrega prices_history se materializa para evitar el plan
-- genérico patológico (ver search_laptops). security invoker -> respeta RLS de lectura pública.

-- Firmas anteriores (3 args por máximo, 4 args por percentil) se reemplazan por la de 5 args.
-- Se eliminan explícitamente para no dejar overloads obsoletos que harían ambigua la llamada.
drop function if exists public.home_deals(int, int, int);
drop function if exists public.home_deals(int, int, int, numeric);

create or replace function public.home_deals(
  p_limit int default 12,
  p_min_drop_pct int default 8,
  p_window_days int default 45,
  p_ref_percentile numeric default 0.5,
  p_max_drop_pct int default 30
)
returns table (
  id uuid,
  slug text,
  brand text,
  model text,
  image_url text,
  current_price_eur numeric,
  old_price_eur numeric,
  drop_pct int,
  ram_gb smallint,
  cpu text,
  screen_inches numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with recent as materialized (
    select ph.laptop_id, ph.retailer_id, ph.price_eur, ph.observed_at
    from public.prices_history ph
    where ph.observed_at >= now() - make_interval(days => p_window_days)
  ),
  current_per_retailer as (
    select distinct on (r.laptop_id, r.retailer_id)
      r.laptop_id, r.price_eur, r.observed_at
    from recent r
    order by r.laptop_id, r.retailer_id, r.observed_at desc
  ),
  cur as (
    select laptop_id, min(price_eur) as current_price, max(observed_at) as last_seen
    from current_per_retailer
    group by laptop_id
  ),
  ref as (
    -- Referencia robusta: percentil (mediana por defecto) del precio en la ventana.
    select laptop_id,
      percentile_cont(p_ref_percentile) within group (order by price_eur)::numeric as old_price
    from recent
    group by laptop_id
  ),
  deals as (
    -- drop_pct se calcula una sola vez; nullif evita división por cero si old_price = 0.
    select
      c.laptop_id,
      c.current_price,
      r.old_price,
      c.last_seen,
      round((r.old_price - c.current_price) / nullif(r.old_price, 0) * 100)::int as drop_pct
    from cur c
    join ref r on r.laptop_id = c.laptop_id
  )
  select
    l.id, l.slug, l.brand, l.model, l.image_url,
    d.current_price as current_price_eur,
    d.old_price as old_price_eur,
    d.drop_pct,
    s.ram_gb, s.cpu, s.screen_inches
  from deals d
  join public.laptops l on l.id = d.laptop_id
  left join public.specs s on s.laptop_id = l.id
  where l.discontinued_at is null
    and d.last_seen >= now() - interval '7 days'
    and d.old_price > d.current_price
    and d.drop_pct >= p_min_drop_pct
    and d.drop_pct <= p_max_drop_pct
  order by d.drop_pct desc, d.current_price asc
  limit p_limit;
$$;

grant execute on function public.home_deals(int, int, int, numeric, int) to anon, authenticated;
