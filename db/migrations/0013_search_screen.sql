-- 0013_search_screen.sql
-- Añade filtro por tamaño de pantalla a search_laptops (p_screen_min / p_screen_max).
--
-- `specs.screen_inches` toma valores discretos aproximados (13, 14, 16, 17; el 16
-- agrupa el rango "15-16" de Algolia). Filtramos por rango [min, max] para ser
-- robustos si aparecen valores intermedios. Cobertura ~97,5% (96 null de 3848).
--
-- Cambia la firma (2 params nuevos) → drop + recreate (create or replace crearía
-- sobrecarga). Cuerpo idéntico al vigente (0009 refurbished + 0010 precio actual)
-- + las dos condiciones de pantalla.

drop function if exists public.search_laptops(
  text, text[], int, numeric, boolean, boolean, boolean, boolean, int, int
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
  p_screen_min  numeric default null,
  p_screen_max  numeric default null,
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
  with latest_per_retailer as (
    select distinct on (laptop_id, retailer_id)
      laptop_id, price_eur
    from public.prices_history
    order by laptop_id, retailer_id, observed_at desc
  ),
  min_prices as (
    select laptop_id, min(price_eur) as min_price
    from latest_per_retailer
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
      and (p_screen_min is null or s.screen_inches >= p_screen_min)
      and (p_screen_max is null or s.screen_inches <= p_screen_max)
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
  text, text[], int, numeric, boolean, boolean, boolean, boolean, numeric, numeric, int, int
) to anon, authenticated;
