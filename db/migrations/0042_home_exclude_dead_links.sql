-- 0042_home_exclude_dead_links.sql
-- La home (Destacados/Novedades) excluye productos sin un enlace de afiliado VIVO
-- (active y unavailable_at is null). Con un solo retailer, enlace muerto = sin vía de
-- compra → no debe aparecer en los feeds. Catálogo/búsqueda no cambian (la ficha degrada).
-- Re-emite las definiciones completas de 0038/0039 añadiendo el filtro `alive_link`.

create or replace function public.home_featured(p_limit int default 8)
returns table (
  id uuid,
  slug text,
  brand text,
  model text,
  image_url text,
  current_price_eur numeric,
  ram_gb smallint,
  cpu text,
  screen_inches numeric
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
    select laptop_id, min(price_eur) as current_price
    from latest group by laptop_id
  )
  select
    f.id, f.slug, f.brand, f.model, f.image_url,
    c.current_price as current_price_eur,
    s.ram_gb, s.cpu, s.screen_inches
  from feat f
  left join cur c on c.laptop_id = f.id
  left join public.specs s on s.laptop_id = f.id
  order by f.featured_rank;
$$;

grant execute on function public.home_featured(int) to anon, authenticated;

create or replace function public.home_novedades(p_limit int default 12)
returns table (
  id uuid,
  slug text,
  brand text,
  model text,
  image_url text,
  current_price_eur numeric,
  ram_gb smallint,
  cpu text,
  screen_inches numeric
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
    select laptop_id, min(price_eur) as current_price
    from latest group by laptop_id
  )
  select
    n.id, n.slug, n.brand, n.model, n.image_url,
    c.current_price as current_price_eur,
    s.ram_gb, s.cpu, s.screen_inches
  from nuevos n
  join cur c on c.laptop_id = n.id
  left join public.specs s on s.laptop_id = n.id
  order by n.created_at desc
  limit p_limit;
$$;

grant execute on function public.home_novedades(int) to anon, authenticated;
