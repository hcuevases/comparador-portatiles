-- 0039_home_novedades.sql
-- "Novedades" de la home: portátiles recién añadidos al catálogo (laptops.created_at desc).
-- Mismo formato card que home_featured (precio actual real + chips). Dato fiable (created_at
-- se fija al insertar; no depende del scraping de precios). Requiere precio actual e imagen
-- para un escaparate limpio. security invoker → RLS de lectura pública.

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
    -- Uno por marca (el más nuevo) para un escaparate variado, no un lote mono-marca.
    -- Filtra no-portátiles colados en el catálogo (servicios/suscripciones/garantías…).
    select distinct on (l.brand)
      l.id, l.slug, l.brand, l.model, l.image_url, l.created_at
    from public.laptops l
    where l.discontinued_at is null
      and l.image_url is not null
      and l.refurbished = false
      and l.model !~* '(servicio|suscrip|garant|licencia|seguro|microsoft 365)'
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
