-- 0030_search_laptops_grouped.sql
-- search_laptops pasa de "una fila por configuración" a "una fila por serie".
-- Mismos parámetros de filtro que 0028; los filtros se aplican a nivel de config y
-- luego se agrupa por (brand, series_key). Una serie aparece si >=1 config casa; sus
-- agregados (min_price, rangos, count) se calculan solo sobre las configs que casan.
-- La clave de grupo cae a id::text cuando series_key es null (esa fila = singleton).
--
-- Cambia returns => drop + create. series_configs devuelve las configs de UNA serie.

drop function if exists public.search_laptops(
  text, text[], int, numeric, boolean, boolean, boolean, boolean, numeric, numeric, text,
  int, numeric, int, numeric, text, int, int
);

create function public.search_laptops(
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
  id            uuid,
  slug          text,
  brand         text,
  model         text,
  series_key    text,
  year          smallint,
  image_url     text,
  min_price     numeric,
  config_count  bigint,
  ram_min       smallint,
  ram_max       smallint,
  storage_min   integer,
  storage_max   integer,
  screen_min    numeric,
  screen_max    numeric,
  cpus          text[],
  rep_cpu       text,
  total_count   bigint
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
      l.id, l.slug, l.brand, l.model, l.series_key, l.year, l.image_url,
      mp.min_price,
      coalesce(l.series_key, l.id::text) as grp,
      s.cpu, s.ram_gb, s.storage_gb, s.screen_inches
    from public.laptops l
    left join public.specs s on s.laptop_id = l.id
    left join min_prices mp  on mp.laptop_id = l.id
    where
      l.discontinued_at is null
      and (p_q is null or l.brand ilike '%' || p_q || '%' or l.model ilike '%' || p_q || '%')
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
  ),
  grouped as (
    select
      f.brand,
      f.series_key,
      count(*) as config_count,
      min(f.min_price) as min_price,
      min(f.ram_gb) as ram_min, max(f.ram_gb) as ram_max,
      min(f.storage_gb) as storage_min, max(f.storage_gb) as storage_max,
      min(f.screen_inches) as screen_min, max(f.screen_inches) as screen_max,
      array_agg(distinct f.cpu) filter (where f.cpu is not null) as cpus,
      (array_agg(f.id        order by f.min_price asc nulls last, f.id asc))[1] as rep_id,
      (array_agg(f.slug      order by f.min_price asc nulls last, f.id asc))[1] as rep_slug,
      (array_agg(f.model     order by f.min_price asc nulls last, f.id asc))[1] as rep_model,
      (array_agg(f.year      order by f.min_price asc nulls last, f.id asc))[1] as rep_year,
      (array_agg(f.image_url order by f.min_price asc nulls last, f.id asc))[1] as rep_image,
      (array_agg(f.cpu       order by f.min_price asc nulls last, f.id asc))[1] as rep_cpu
    from filtered f
    group by f.brand, f.grp, f.series_key
  )
  select
    rep_id as id, rep_slug as slug, brand, rep_model as model, series_key,
    rep_year as year, rep_image as image_url, min_price, config_count,
    ram_min, ram_max, storage_min, storage_max, screen_min, screen_max, cpus, rep_cpu,
    count(*) over () as total_count
  from grouped
  order by
    case when p_sort = 'price_asc'  then min_price end asc  nulls last,
    case when p_sort = 'price_desc' then min_price end desc nulls last,
    brand asc, series_key asc nulls last
  limit p_limit offset p_offset;
$$;

grant execute on function public.search_laptops(
  text, text[], int, numeric, boolean, boolean, boolean, boolean, numeric, numeric, text,
  int, numeric, int, numeric, text, int, int
) to anon, authenticated;

-- Configuraciones de UNA serie (al expandir). Mismos filtros que search_laptops para
-- que la lista expandida sea coherente con lo filtrado. Ordenadas por precio asc.
create or replace function public.series_configs(
  p_brand        text,
  p_series_key   text,
  p_q            text    default null,
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
  p_battery_min  numeric default null
)
returns table (
  id            uuid,
  slug          text,
  brand         text,
  model         text,
  year          smallint,
  image_url     text,
  min_price     numeric,
  cpu           text,
  ram_gb        smallint,
  storage_gb    integer,
  screen_inches numeric
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
  )
  select
    l.id, l.slug, l.brand, l.model, l.year, l.image_url, mp.min_price,
    s.cpu, s.ram_gb, s.storage_gb, s.screen_inches
  from public.laptops l
  left join public.specs s on s.laptop_id = l.id
  left join min_prices mp  on mp.laptop_id = l.id
  where
    l.discontinued_at is null
    and l.brand = p_brand
    and coalesce(l.series_key, l.id::text) = p_series_key
    and (p_q is null or l.brand ilike '%' || p_q || '%' or l.model ilike '%' || p_q || '%')
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
  order by mp.min_price asc nulls last, l.id asc;
$$;

grant execute on function public.series_configs(
  text, text, text, int, numeric, boolean, boolean, boolean, boolean, numeric, numeric,
  text, int, numeric, int, numeric
) to anon, authenticated;
