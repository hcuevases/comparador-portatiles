-- 0028_laptops_discontinued.sql
-- Retira del catálogo los portátiles que han desaparecido de TODOS los retailers
-- (soft-hide, reversible) en lugar de borrarlos: conserva histórico de precios,
-- comparativas guardadas y alertas.
--
-- Señal de "disponible" = tiene un precio reciente en prices_history de CUALQUIER
-- retailer. Es inherentemente multi-retailer: un portátil que sale de PcComponentes
-- pero sigue en Amazon/MediaMarkt/ECI mantiene precio reciente → no se oculta. No hace
-- falta un last_seen_at nuevo ni tocar la ruta de escritura de la ingesta.

alter table public.laptops add column if not exists discontinued_at timestamptz;

-- Índice parcial: el catálogo filtra por "discontinued_at is null" (los visibles).
create index if not exists laptops_active_idx on public.laptops (id) where discontinued_at is null;

-- Marca como descatalogados los no vistos (sin precio reciente) y restaura los que
-- vuelven a tener precio. `p_days`: ventana de gracia (sobrevive a runs fallidos).
-- Solo oculta productos con >= p_days de antigüedad para no esconder altas recién
-- creadas que aún no tienen precio.
create or replace function public.prune_discontinued(p_days int default 14)
returns table (discontinued int, restored int)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_disc int;
  v_rest int;
begin
  with seen as (
    select distinct laptop_id
    from public.prices_history
    where observed_at > now() - make_interval(days => p_days)
  ),
  upd as (
    update public.laptops l
    set discontinued_at = now()
    where l.discontinued_at is null
      and l.created_at < now() - make_interval(days => p_days)
      and not exists (select 1 from seen where seen.laptop_id = l.id)
    returning 1
  )
  select count(*) into v_disc from upd;

  with seen as (
    select distinct laptop_id
    from public.prices_history
    where observed_at > now() - make_interval(days => p_days)
  ),
  upd as (
    update public.laptops l
    set discontinued_at = null
    where l.discontinued_at is not null
      and exists (select 1 from seen where seen.laptop_id = l.id)
    returning 1
  )
  select count(*) into v_rest from upd;

  discontinued := v_disc;
  restored := v_rest;
  return next;
end;
$$;

grant execute on function public.prune_discontinued(int) to service_role;

-- Recreación de search_laptops con el filtro `discontinued_at is null` (misma firma,
-- así que create or replace basta). Cuerpo idéntico a 0022 salvo esa línea.
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
