-- 0001_init.sql
-- Esquema inicial del comparador de portátiles.
--
-- Convenciones:
--   * ids como UUID con default gen_random_uuid()
--   * timestamps como timestamptz con default now()
--   * slug único y minúsculas para URLs limpias
--   * RLS activado en todo lo expuesto al cliente; lectura pública pero
--     escritura solo desde service role (ingesta) o desde el dueño (comparaciones).

-- ─── Tablas de catálogo ──────────────────────────────────────────────────────

create table public.retailers (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  base_url     text,
  affiliate_id text,                       -- código de afiliado por retailer
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table public.laptops (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,        -- ej: lenovo-thinkpad-x1-carbon-gen-12
  brand        text not null,
  model        text not null,
  year         smallint,
  image_url    text,
  description  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index laptops_brand_idx on public.laptops (brand);
create index laptops_year_idx  on public.laptops (year);

-- Specs como columnas concretas — más query-friendly que un jsonb genérico.
-- Si en el futuro hay specs muy específicas por categoría, se puede añadir
-- una columna jsonb `extra` sin migrar el resto.
create table public.specs (
  laptop_id          uuid primary key references public.laptops(id) on delete cascade,
  cpu                text,
  cpu_cores          smallint,
  ram_gb             smallint,
  storage_gb         integer,
  storage_type       text,                  -- ej: 'NVMe', 'SATA SSD'
  gpu                text,
  gpu_vram_gb        smallint,
  screen_inches      numeric(3,1),
  screen_resolution  text,                  -- ej: '1920x1200'
  screen_refresh_hz  smallint,
  weight_kg          numeric(4,2),
  battery_wh         numeric(5,1),
  ports              text[],                -- ej: ARRAY['USB-C','HDMI']
  os                 text,
  updated_at         timestamptz not null default now()
);

-- ─── Precios ─────────────────────────────────────────────────────────────────

create table public.affiliate_links (
  id           uuid primary key default gen_random_uuid(),
  laptop_id    uuid not null references public.laptops(id) on delete cascade,
  retailer_id  uuid not null references public.retailers(id) on delete cascade,
  url          text not null,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (laptop_id, retailer_id)
);

create table public.prices_history (
  id             bigserial primary key,
  laptop_id      uuid not null references public.laptops(id) on delete cascade,
  retailer_id    uuid not null references public.retailers(id) on delete cascade,
  price_eur      numeric(10,2) not null,
  currency       text not null default 'EUR',
  in_stock       boolean,
  observed_at    timestamptz not null default now()
);

create index prices_history_laptop_observed_idx
  on public.prices_history (laptop_id, observed_at desc);

create index prices_history_retailer_observed_idx
  on public.prices_history (retailer_id, observed_at desc);

-- ─── Comparativas guardadas (por usuario autenticado) ────────────────────────

create table public.comparisons (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  slug         text,                        -- compartible si la haces pública
  name         text,
  laptop_ids   uuid[] not null,             -- orden de presentación
  is_public    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index comparisons_user_idx on public.comparisons (user_id);
create unique index comparisons_public_slug_idx
  on public.comparisons (slug) where slug is not null;

-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table public.retailers       enable row level security;
alter table public.laptops         enable row level security;
alter table public.specs           enable row level security;
alter table public.affiliate_links enable row level security;
alter table public.prices_history  enable row level security;
alter table public.comparisons     enable row level security;

-- Lectura pública del catálogo (anon + authenticated).
create policy "public read retailers"       on public.retailers       for select using (true);
create policy "public read laptops"         on public.laptops         for select using (true);
create policy "public read specs"           on public.specs           for select using (true);
create policy "public read affiliate_links" on public.affiliate_links for select using (active);
create policy "public read prices_history"  on public.prices_history  for select using (true);

-- Comparativas: el usuario ve las suyas + las marcadas como públicas.
create policy "owner reads own comparisons"
  on public.comparisons for select
  using (auth.uid() = user_id or is_public);

create policy "owner writes own comparisons"
  on public.comparisons for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Escritura en catálogo y precios: sin política => solo service role
-- (la ingesta corre con SUPABASE_SERVICE_ROLE_KEY y omite RLS).

-- ─── Trigger updated_at ──────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger laptops_updated_at
  before update on public.laptops
  for each row execute function public.set_updated_at();

create trigger specs_updated_at
  before update on public.specs
  for each row execute function public.set_updated_at();

create trigger comparisons_updated_at
  before update on public.comparisons
  for each row execute function public.set_updated_at();
