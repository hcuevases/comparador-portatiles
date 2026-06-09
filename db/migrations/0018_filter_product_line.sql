-- 0018_filter_product_line.sql
-- Filtro por SERIE (`product_line`) en la home: p.ej. "Lenovo ThinkPad",
-- "HP EliteBook", "ASUS Vivobook". `product_line` tiene 86% de cobertura (3471 de
-- 4020) y ~105 valores distintos, todos con prefijo de marca → es un eje de filtro
-- natural para un comparador.
--
-- Dos cambios:
--   1. RPC `distinct_product_lines()`: lista las series del catálogo con su conteo,
--      ordenadas por nombre. La home la usa para poblar el <select> (filtrando por
--      un umbral mínimo de conteo en TS para descartar la cola de series con 1-2
--      unidades, donde se concentran los mislabels del scraper —p.ej. portátiles con
--      brand=Lenovo y product_line de otra marca). Lista plana, sin acotar por marca:
--      predecible y sin sorpresas cruzadas.
--   2. `search_laptops` gana `p_product_line` (igualdad exacta sobre s.product_line).
--      Añadir parámetro = cambio de firma → drop + recreate. Cuerpo idéntico al
--      vigente (0017, con el `min_prices as materialized` que arregló el timeout)
--      salvo la nueva condición del WHERE.

-- ── 1. Series distintas (para el <select>) ──────────────────────────────────
drop function if exists public.distinct_product_lines(text[]);

create or replace function public.distinct_product_lines()
returns table (product_line text, n bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select s.product_line, count(*) as n
  from public.specs s
  where s.product_line is not null
  group by s.product_line
  order by s.product_line;
$$;

grant execute on function public.distinct_product_lines() to anon, authenticated;

-- ── 2. search_laptops + p_product_line ──────────────────────────────────────
drop function if exists public.search_laptops(
  text, text[], int, numeric, boolean, boolean, boolean, boolean, numeric, numeric, text, int, int
);

create or replace function public.search_laptops(
  p_q            text    default null,
  p_brands       text[]  default null,
  p_ram_min      int     default 0,
  p_price_max    numeric default null,
  p_gaming       boolean default false,
  p_ai           boolean default false,
  p_oled         boolean default false,
  p_refurbished  boolean default false,
  p_screen_min   numeric default null,
  p_screen_max   numeric default null,
  p_product_line text    default null,
  p_sort         text    default null,
  p_limit        int     default 24,
  p_offset       int     default 0
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
  min_prices as materialized (
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
      and (p_product_line is null or s.product_line = p_product_line)
      and (p_price_max is null or (mp.min_price is not null and mp.min_price <= p_price_max))
  )
  select
    id, slug, brand, model, year, image_url, min_price,
    count(*) over () as total_count
  from filtered
  order by
    case when p_sort = 'price_asc'  then min_price end asc  nulls last,
    case when p_sort = 'price_desc' then min_price end desc nulls last,
    brand asc, id asc
  limit p_limit offset p_offset;
$$;

grant execute on function public.search_laptops(
  text, text[], int, numeric, boolean, boolean, boolean, boolean, numeric, numeric, text, text, int, int
) to anon, authenticated;
