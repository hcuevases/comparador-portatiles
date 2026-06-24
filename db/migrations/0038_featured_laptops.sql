-- 0038_featured_laptops.sql
-- "Destacados" editorial de la home: laptops.featured_rank (null = no destacado; menor =
-- antes) + RPC home_featured que los devuelve en formato card con precio actual real.
-- Curado por SQL (sin panel de admin; apuntado como mejora futura en el spec).

alter table public.laptops add column if not exists featured_rank smallint;

create index if not exists laptops_featured_rank_idx
  on public.laptops (featured_rank) where featured_rank is not null;

create or replace function public.home_featured(p_limit int default 8)
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
  with feat as (
    select l.id, l.slug, l.brand, l.model, l.image_url, l.featured_rank
    from public.laptops l
    where l.featured_rank is not null and l.discontinued_at is null
    order by l.featured_rank
    limit p_limit
  ),
  latest as (
    select distinct on (ph.laptop_id, ph.retailer_id) ph.laptop_id, ph.price_eur
    from public.prices_history ph
    where ph.laptop_id in (select id from feat)
    order by ph.laptop_id, ph.retailer_id, ph.observed_at desc
  ),
  cur as (
    select laptop_id, min(price_eur) as current_price
    from latest group by laptop_id
  )
  select
    f.id, f.slug, f.brand, f.model, f.image_url,
    c.current_price as current_price_eur,
    s.ram_gb, s.cpu, s.screen_inches
  from feat f
  left join cur c on c.laptop_id = f.id
  left join public.specs s on s.laptop_id = f.id
  order by f.featured_rank;
$$;

grant execute on function public.home_featured(int) to anon, authenticated;
