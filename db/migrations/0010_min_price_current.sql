-- 0010_min_price_current.sql
-- Cambia el `min_price` de search_laptops de "mínimo sobre TODO el histórico" a
-- "precio ACTUAL" (último precio por retailer → mínimo entre retailers).
--
-- PROBLEMA: la home mostraba "Desde X€" usando el precio más bajo jamás
-- registrado, no el actual. La ficha (`/portatiles/[slug]`) usa el último precio
-- por retailer. Resultado: 87 de 622 portátiles (14%) mostraban en la home un
-- precio de media 45€ MÁS BARATO que el real (hasta 294€), y al entrar en la
-- ficha el precio "subía". Inconsistente y engañoso en un comparador.
--
-- Ahora ambas vistas usan la misma definición: para cada (laptop, retailer) el
-- último `price_eur` por `observed_at`, y el mínimo entre retailers por laptop.
--
-- Misma firma que 0009 → basta `create or replace` (no cambia el contrato, no
-- hace falta drop). El resto del cuerpo es idéntico.

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
  with latest_per_retailer as (
    -- Último precio observado por (laptop, retailer).
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
      and (p_price_max is null or (mp.min_price is not null and mp.min_price <= p_price_max))
  )
  select
    id, slug, brand, model, year, image_url, min_price,
    count(*) over () as total_count
  from filtered
  order by brand asc, id asc
  limit p_limit offset p_offset;
$$;
