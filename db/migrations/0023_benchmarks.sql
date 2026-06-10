-- 0023_benchmarks.sql
-- Benchmarks de CPU/GPU desde nanoreview, almacenados POR COMPONENTE (no por
-- portátil): un mismo chip lo comparten cientos de portátiles → se scrapea una vez.
-- Ver docs/superpowers/specs/2026-06-10-nanoreview-benchmarks-design.md y ADR-005.
--
-- specs.cpu_key / gpu_key: clave canónica del componente (la rellena el enricher
-- desde el nombre del portátil). NO es FK real: la clave se fija ANTES de que exista
-- la fila del componente (se scrapea en un segundo paso), así que una FK la
-- bloquearía. El join ficha/comparar es LEFT por esta clave.
--
-- status: 'ok' (datos) | 'notfound' (intentado, sin página) → marca incremental para
-- no reintentar. Los muros/errores transitorios NO se persisten (se reintentan).
--
-- RLS: lectura pública como el resto del catálogo. La escritura la hace el enricher
-- con service role (omite RLS), así que no hay policy de escritura.

create table if not exists public.cpu_benchmarks (
  component_key     text primary key,           -- ej. intel-core-i7-13620h
  name              text,                        -- nombre display (de nanoreview)
  nanoreview_slug   text,
  status            text not null default 'ok',  -- 'ok' | 'notfound'
  score             integer,                     -- nota global nanoreview (0-100)
  geekbench_single  integer,
  geekbench_multi   integer,
  cores             integer,
  threads           integer,
  tdp_w             integer,
  release_year      integer,
  scraped_at        timestamptz not null default now()
);

create table if not exists public.gpu_benchmarks (
  component_key     text primary key,            -- ej. rtx-5060-laptop
  name              text,
  nanoreview_slug   text,
  status            text not null default 'ok',  -- 'ok' | 'notfound'
  score             integer,
  g3dmark           integer,                     -- puntuación 3DMark de nanoreview
  vram_gb           integer,
  tdp_w             integer,
  scraped_at        timestamptz not null default now()
);

-- Correcciones manuales del matching clave→slug (cuando el normalizador falla).
create table if not exists public.benchmark_overrides (
  kind             text not null,                -- 'cpu' | 'gpu'
  source_key       text not null,                -- clave que produjo el normalizador
  nanoreview_slug  text not null,                -- slug correcto a usar
  primary key (kind, source_key)
);

-- Claves del componente en specs (rellenadas por el enricher). Sin FK a propósito.
alter table public.specs add column if not exists cpu_key text;
alter table public.specs add column if not exists gpu_key text;

create index if not exists specs_cpu_key_idx on public.specs (cpu_key);
create index if not exists specs_gpu_key_idx on public.specs (gpu_key);

alter table public.cpu_benchmarks     enable row level security;
alter table public.gpu_benchmarks     enable row level security;
alter table public.benchmark_overrides enable row level security;

-- Idempotente: solo crea la policy si no existe (re-aplicar la migración no falla).
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='cpu_benchmarks' and policyname='public read cpu_benchmarks') then
    create policy "public read cpu_benchmarks" on public.cpu_benchmarks for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='gpu_benchmarks' and policyname='public read gpu_benchmarks') then
    create policy "public read gpu_benchmarks" on public.gpu_benchmarks for select using (true);
  end if;
  -- benchmark_overrides: sin policy de lectura pública (solo lo usa el enricher con
  -- service role). RLS activado sin policy = nadie más lo lee. Correcto.
end$$;
