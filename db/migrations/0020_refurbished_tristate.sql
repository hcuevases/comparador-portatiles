-- 0020_refurbished_tristate.sql
-- `p_refurbished` pasa de booleano "solo reacondicionados / todos" a TRI-ESTADO:
--   null  → todos (nuevos + reacondicionados)
--   true  → SOLO reacondicionados
--   false → SOLO nuevos (EXCLUYE reacondicionados)  ← lo que faltaba
--
-- POR QUÉ: el asistente IA (y cualquiera) no podía pedir "portátil NUEVO": el filtro
-- solo sabía "solo reacondicionados" (true) o "sin filtro" (false). Cuando el usuario
-- pedía "nuevo", el modelo ponía refurbished=false creyendo que excluía los
-- reacondicionados, pero eso era "sin filtro" → seguían saliendo. Ahora false excluye.
--
-- Misma firma (sigue siendo boolean) → basta create or replace. Cuerpo idéntico a 0018
-- salvo el default de p_refurbished y su condición en el WHERE.
--
-- OJO consumidores: la home pasaba `false` cuando el pill estaba apagado (= todos); con
-- la semántica nueva eso significaría "solo nuevos". Por eso app/page.tsx se actualiza a
-- la vez para pasar `undefined` cuando el pill está apagado (comportamiento sin cambios).

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
