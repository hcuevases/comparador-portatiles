-- 0022_search_enriched_filters.sql
-- Añade a search_laptops filtros por las specs enriquecidas (las que rellena el
-- enricher de la ficha, ahora con buena cobertura): tasa de refresco mínima, peso
-- máximo, VRAM mínima y batería mínima. Los usa sobre todo el asistente IA para
-- afinar ("gaming de 144Hz+", "ultraligero <1,3kg", "GPU de 8GB+", "buena batería").
--
-- OJO cobertura: estos campos no están al 100% (p.ej. refresh y VRAM solo en los
-- portátiles que los listan). Un filtro `>= X` excluye los que tienen el dato en null,
-- así que acota a productos que CONFIRMAN la spec — el comportamiento deseado para
-- "quiero 144Hz".
--
-- Añade parámetros = cambio de firma → drop + recreate. Cuerpo idéntico a 0020 salvo
-- los 4 parámetros nuevos y sus condiciones en el WHERE.

drop function if exists public.search_laptops(
  text, text[], int, numeric, boolean, boolean, boolean, boolean, numeric, numeric, text, text, int, int
);

create or replace function public.search_laptops(
  p_q            text    default null,
  p_brands       text[]  default null,
  p_ram_min      int     default 0,
  p_price_max    numeric default null,
  p_gaming       boolean default false,
  p_ai           boolean default false,
  p_oled         boolean default false,
  p_refurbished  boolean default null,
  p_screen_min   numeric default null,
  p_screen_max   numeric default null,
  p_product_line text    default null,
  p_refresh_min  int     default null,
  p_weight_max   numeric default null,
  p_vram_min     int     default null,
  p_battery_min  numeric default null,
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
      and (p_refurbished is null or l.refurbished = p_refurbished)
      and (p_screen_min is null or s.screen_inches >= p_screen_min)
      and (p_screen_max is null or s.screen_inches <= p_screen_max)
      and (p_product_line is null or s.product_line = p_product_line)
      and (p_refresh_min is null or s.screen_refresh_hz >= p_refresh_min)
      and (p_weight_max is null or s.weight_kg <= p_weight_max)
      and (p_vram_min is null or s.gpu_vram_gb >= p_vram_min)
      and (p_battery_min is null or s.battery_wh >= p_battery_min)
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
  text, text[], int, numeric, boolean, boolean, boolean, boolean, numeric, numeric, text,
  int, numeric, int, numeric, text, int, int
) to anon, authenticated;
