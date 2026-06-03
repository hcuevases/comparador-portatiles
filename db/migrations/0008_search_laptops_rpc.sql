-- 0008_search_laptops_rpc.sql
-- RPC `search_laptops`: búsqueda + filtros + precio + paginación + count en una
-- sola query server-side.
--
-- PROBLEMA QUE RESUELVE: la home calculaba el precio mínimo en cliente trayendo
-- TODO `prices_history` (~3k filas hoy, sin filtrar) y aplicaba el filtro de
-- precio máximo después de paginar. Dos consecuencias malas:
--   1. El `count: 'exact'` sobreestimaba (no contaba el filtro de precio) → una
--      página podía mostrar < 24 cards y "página X de N" mentía.
--   2. No escala: traer todo prices_history en cada carga revienta con el catálogo
--      grande.
--
-- Esta función mueve el filtro de precio al WHERE (junto al resto) y agrega el
-- mínimo en SQL, así el `total_count` (window) es exacto y solo viajan 24 filas.
--
-- min_price = min(price_eur) sobre TODO el histórico, igual que hacía el cliente
-- (semántica preservada). TODO: debería ser el precio ACTUAL (último por retailer,
-- luego min) para cuadrar con la ficha; es otra tarea.
--
-- security invoker: corre con los permisos del llamante → la RLS de lectura
-- pública de laptops/specs/prices_history aplica igual que en las queries directas.
--
-- Los filtros de specs (ram/gaming/ai/oled) usan LEFT JOIN + condición: un laptop
-- sin fila en `specs`, o con el valor null, queda excluido cuando el filtro está
-- activo (equivale al `specs!inner` del código anterior). Sin filtro de specs, se
-- incluye igual (no filtra).

-- Índice de apoyo para el min por laptop (cubre el group by + min sin tocar tabla).
create index if not exists prices_history_laptop_price_idx
  on public.prices_history (laptop_id, price_eur);

create or replace function public.search_laptops(
  p_q         text    default null,
  p_brands    text[]  default null,
  p_ram_min   int     default 0,
  p_price_max numeric default null,
  p_gaming    boolean default false,
  p_ai        boolean default false,
  p_oled      boolean default false,
  p_limit     int     default 24,
  p_offset    int     default 0
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
  text, text[], int, numeric, boolean, boolean, boolean, int, int
) to anon, authenticated;
