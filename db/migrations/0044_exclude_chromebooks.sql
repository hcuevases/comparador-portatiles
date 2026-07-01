-- 0044_exclude_chromebooks.sql
-- Excluye Chromebooks de las TRES secciones de la home (home_deals/home_featured/home_novedades).
-- Detección validada contra el dato real: model ~* 'chromebook' (58) ∪ slug ~* 'chromebook|chromeos'
-- = 60 equipos (incl. 2 Lenovo "Chrome 2in1" sin "chromebook" en el modelo). search_laptops NO se
-- toca → los Chromebooks siguen en /catalogo. Filtro añadido:
--   and l.model !~* 'chromebook' and l.slug !~* 'chromebook|chromeos'

-- 1) Chollos
create or replace function public.home_deals(
  p_limit int default 12,
  p_min_drop_pct int default 8,
  p_window_days int default 45,
  p_ref_percentile numeric default 0.5,
  p_max_drop_pct int default 30
)
returns table (
  id uuid, slug text, brand text, model text, image_url text,
  current_price_eur numeric, old_price_eur numeric, drop_pct int,
  ram_gb smallint, cpu text, screen_inches numeric
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
    from current_per_retailer group by laptop_id
  ),
  ref as (
    select laptop_id,
      percentile_cont(p_ref_percentile) within group (order by price_eur)::numeric as old_price
    from recent group by laptop_id
  ),
  deals as (
    select
      c.laptop_id, c.current_price, r.old_price, c.last_seen,
      round((r.old_price - c.current_price) / nullif(r.old_price, 0) * 100)::int as drop_pct
    from cur c join ref r on r.laptop_id = c.laptop_id
  )
  select
    l.id, l.slug, l.brand, l.model, l.image_url,
    d.current_price as current_price_eur, d.old_price as old_price_eur, d.drop_pct,
    s.ram_gb, s.cpu, s.screen_inches
  from deals d
  join public.laptops l on l.id = d.laptop_id
  left join public.specs s on s.laptop_id = l.id
  where l.discontinued_at is null
    and d.last_seen >= now() - interval '7 days'
    and d.old_price > d.current_price
    and d.drop_pct >= p_min_drop_pct
    and d.drop_pct <= p_max_drop_pct
    and l.model !~* 'chromebook' and l.slug !~* 'chromebook|chromeos'
  order by d.drop_pct desc, d.current_price asc
  limit p_limit;
$$;

grant execute on function public.home_deals(int, int, int, numeric, int) to anon, authenticated;

-- 2) Destacados
create or replace function public.home_featured(p_limit int default 8)
returns table (
  id uuid, slug text, brand text, model text, image_url text,
  current_price_eur numeric, ram_gb smallint, cpu text, screen_inches numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with feat as (
    select l.id, l.slug, l.brand, l.model, l.image_url, l.featured_rank
    from public.laptops l
    where l.featured_rank is not null
      and l.discontinued_at is null
      and l.model !~* 'chromebook' and l.slug !~* 'chromebook|chromeos'
      and exists (
        select 1 from public.affiliate_links al
        where al.laptop_id = l.id and al.active and al.unavailable_at is null
      )
    order by l.featured_rank
    limit p_limit
  ),
  latest as (
    select distinct on (ph.laptop_id, ph.retailer_id) ph.laptop_id, ph.price_eur
    from public.prices_history ph
    where ph.laptop_id in (select id from feat)
    order by ph.laptop_id, ph.retailer_id, ph.observed_at desc
  ),
  cur as (
    select laptop_id, min(price_eur) as current_price from latest group by laptop_id
  )
  select
    f.id, f.slug, f.brand, f.model, f.image_url,
    c.current_price as current_price_eur, s.ram_gb, s.cpu, s.screen_inches
  from feat f
  left join cur c on c.laptop_id = f.id
  left join public.specs s on s.laptop_id = f.id
  order by f.featured_rank;
$$;

grant execute on function public.home_featured(int) to anon, authenticated;

-- 3) Novedades
create or replace function public.home_novedades(p_limit int default 12)
returns table (
  id uuid, slug text, brand text, model text, image_url text,
  current_price_eur numeric, ram_gb smallint, cpu text, screen_inches numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with per_brand as (
    select distinct on (l.brand)
      l.id, l.slug, l.brand, l.model, l.image_url, l.created_at
    from public.laptops l
    where l.discontinued_at is null
      and l.image_url is not null
      and l.refurbished = false
      and l.model !~* '(servicio|suscrip|garant|licencia|seguro|microsoft 365)'
      and l.model !~* 'chromebook' and l.slug !~* 'chromebook|chromeos'
      and exists (
        select 1 from public.affiliate_links al
        where al.laptop_id = l.id and al.active and al.unavailable_at is null
      )
    order by l.brand, l.created_at desc
  ),
  nuevos as (
    select * from per_brand order by created_at desc limit 30
  ),
  latest as (
    select distinct on (ph.laptop_id, ph.retailer_id) ph.laptop_id, ph.price_eur
    from public.prices_history ph
    where ph.laptop_id in (select id from nuevos)
    order by ph.laptop_id, ph.retailer_id, ph.observed_at desc
  ),
  cur as (
    select laptop_id, min(price_eur) as current_price from latest group by laptop_id
  )
  select
    n.id, n.slug, n.brand, n.model, n.image_url,
    c.current_price as current_price_eur, s.ram_gb, s.cpu, s.screen_inches
  from nuevos n
  join cur c on c.laptop_id = n.id
  left join public.specs s on s.laptop_id = n.id
  order by n.created_at desc
  limit p_limit;
$$;

grant execute on function public.home_novedades(int) to anon, authenticated;
