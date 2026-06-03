-- 0009_refurbished.sql
-- Añade el flag `refurbished` a `laptops` y lo expone como filtro en search_laptops.
--
-- Los reacondicionados se detectan por el slug terminado en `-refurbished` (tras
-- la migración 0007) — equivalente al `?refurbished` que Algolia mete en el slug
-- crudo. Es propiedad del PORTÁTIL, así que la columna va en `laptops`, no en
-- `specs`.
--
-- IDEMPOTENTE: add column if not exists + backfill por patrón de slug.

alter table public.laptops
  add column if not exists refurbished boolean not null default false;

update public.laptops
set refurbished = true
where slug like '%-refurbished' and refurbished = false;

-- Recreamos search_laptops con un parámetro nuevo `p_refurbished`. Hay que DROP
-- antes: añadir un parámetro cambia la firma y `create or replace` crearía una
-- sobrecarga (dos funciones) en vez de reemplazar, lo que confunde a PostgREST.
drop function if exists public.search_laptops(
  text, text[], int, numeric, boolean, boolean, boolean, int, int
);

create or replace function public.search_laptops(
  p_q           text    default null,
  p_brands      text[]  default null,
  p_ram_min     int     default 0,
  p_price_max   numeric default null,
  p_gaming      boolean default false,
  p_ai          boolean default false,
  p_oled        boolean default false,
  p_refurbished boolean default false,
  p_limit       int     default 24,
  p_offset      int     default 0
)
returns table (
  id          uuid,
  slug        text,
  brand       text,
  model       text,
  year        smallint,
  image_url   text,
  min_price   numeric,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with min_prices as (
    select laptop_id, min(price_eur) as min_price
    from public.prices_history
    group by laptop_id
  ),
  filtered as (
    select
      l.id, l.slug, l.brand, l.model, l.year, l.image_url, mp.min_price
    from public.laptops l
    left join public.specs s on s.laptop_id = l.id
    left join min_prices mp  on mp.laptop_id = l.id
    where
      (p_q is null or l.brand ilike '%' || p_q || '%' or l.model ilike '%' || p_q || '%')
      and (p_brands is null or l.brand = any (p_brands))
      and (p_ram_min = 0 or s.ram_gb >= p_ram_min)
      and (not p_gaming or s.usage_type = 'Gaming')
      and (not p_ai or s.ai_optimized = true)
      and (not p_oled or s.screen_panel_type in ('OLED', 'AMOLED'))
      and (not p_refurbished or l.refurbished = true)
      and (p_price_max is null or (mp.min_price is not null and mp.min_price <= p_price_max))
  )
  select
    id, slug, brand, model, year, image_url, min_price,
    count(*) over () as total_count
  from filtered
  order by brand asc, id asc
  limit p_limit offset p_offset;
$$;

grant execute on function public.search_laptops(
  text, text[], int, numeric, boolean, boolean, boolean, boolean, int, int
) to anon, authenticated;
