-- 0041_affiliate_link_health.sql
-- Salud de los enlaces de afiliado. El checker (scripts/check-links.ts) escribe estas
-- columnas; el scraper (scrape-catalog.ts) NO las toca (solo url+active). unavailable_at
-- IS NULL = vivo o sin verificar; non-null = confirmado 410/404. Las filas existentes
-- quedan vivas (nada se oculta hasta verificar). Reversible: drop column.
alter table public.affiliate_links add column if not exists unavailable_at timestamptz;
alter table public.affiliate_links add column if not exists checked_at     timestamptz;
alter table public.affiliate_links add column if not exists last_status    int;

-- Prioriza nunca-verificados (checked_at null) y luego los más antiguos.
create index if not exists affiliate_links_checked_at_idx
  on public.affiliate_links (checked_at nulls first) where active;

-- Candidatos a verificar, en orden de prioridad: destacados primero, luego
-- nunca/antiguo-verificados, recientes como desempate. Solo URLs de PcComponentes
-- activas de laptops visibles. La llama el checker con el service role.
create or replace function public.affiliate_links_to_check(p_limit int default 150)
returns table (id uuid, url text)
language sql
stable
security invoker
set search_path = public
as $$
  select al.id, al.url
  from public.affiliate_links al
  join public.laptops l on l.id = al.laptop_id
  where al.active
    and l.discontinued_at is null
    and al.url like 'https://www.pccomponentes.com/%'
  order by
    (l.featured_rank is null) asc,      -- destacados (featured_rank not null) primero
    al.checked_at asc nulls first,      -- nunca verificados, luego los más antiguos
    l.created_at desc                   -- recientes antes
  limit p_limit;
$$;

grant execute on function public.affiliate_links_to_check(int) to service_role;
