# Agrupar variantes por serie en el grid — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agrupar en el grid de la home las configuraciones de un mismo modelo bajo una card de serie expandible inline, en vez de mostrar una card por cada SKU casi idéntico.

**Architecture:** Una columna materializada `laptops.series_key` (calculada por trigger desde el título, corregible a mano) sirve de clave de agrupación. El RPC `search_laptops` pasa a devolver una fila por serie (representante + agregados + rangos); un RPC nuevo `series_configs` devuelve las configs de una serie al expandir (lazy, vía route handler). El grid pinta cards de serie con badge y chips de rango; el comparador no cambia (selección por `laptop_id`).

**Tech Stack:** Next.js 16 (App Router, RSC), Supabase (Postgres, RPC `language sql`), TypeScript estricto, Vitest. Migraciones SQL versionadas en `db/migrations/`, aplicadas vía Supabase Management API. Tipos generados con `npm run db:types`.

**Convenciones del repo (recordatorio):**
- Rama ya creada: `feat/agrupar-series`. No commits a `main`.
- No usar `prettier --write` (el repo es CRLF; ensucia el diff). Verificar con `npm run lint && npm run typecheck && npm test`.
- Migraciones idempotentes cuando se pueda (`if not exists`, `create or replace`).
- Aplicar SQL vía Management API. Helper de shell usado en todo el plan (PAT en `.env.local`):

```bash
# Ejecuta el SQL de un archivo contra la BD vía Management API.
applysql() {
  local FILE="$1"
  local PAT=$(grep -E '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2- | tr -d '\r"')
  local REF=uhnbfyjapxbmifyeacly
  local SQL=$(cat "$FILE")
  local PAYLOAD=$(SQL="$SQL" node -e 'process.stdout.write(JSON.stringify({query:process.env.SQL}))')
  curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
    -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" -d "$PAYLOAD"; echo
}
# Para una consulta suelta de verificación, mismo patrón con SQL inline:
runsql() {
  local PAT=$(grep -E '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2- | tr -d '\r"')
  local PAYLOAD=$(SQL="$1" node -e 'process.stdout.write(JSON.stringify({query:process.env.SQL}))')
  curl -s -X POST "https://api.supabase.com/v1/projects/uhnbfyjapxbmifyeacly/database/query" \
    -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" -d "$PAYLOAD"; echo
}
```

---

## Estructura de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `db/migrations/0029_series_key.sql` | Crear | Columna `series_key` + `series_locked`, `compute_series_key()`, trigger, backfill, índice |
| `db/migrations/0030_search_laptops_grouped.sql` | Crear | `search_laptops` agrupado por serie + `series_configs()` |
| `lib/supabase/database.types.ts` | Regenerar | Tipos de las nuevas firmas de RPC |
| `lib/series-chips.ts` | Crear | Helpers puros: chips de rango (RAM/almacenamiento/pantalla/CPU), formato |
| `lib/series-chips.test.ts` | Crear | Tests unitarios de los helpers |
| `app/api/series/configs/route.ts` | Crear | Route handler: llama a `series_configs`, devuelve JSON |
| `components/laptop-card-item.tsx` | Crear | Card de una configuración concreta (imagen+chips+precio+checkbox+link), reutilizable |
| `components/laptop-grid.tsx` | Modificar | Cards de serie (singleton vs multi) + expandir inline |
| `app/page.tsx` | Modificar | Tipo `SearchRow` con campos de serie; quitar fetch de specs aparte |

---

## Task 1: Migración 0029 — columna `series_key`, función, trigger, backfill

**Files:**
- Create: `db/migrations/0029_series_key.sql`

- [ ] **Step 1: Escribir la migración**

Crear `db/migrations/0029_series_key.sql`:

```sql
-- 0029_series_key.sql
-- Clave de agrupación de variantes: el prefijo del título del producto antes del
-- primer token de specs (pantalla/CPU/RAM). PcComponentes mete toda la config en el
-- título (= laptops.model), así que cada SKU es una fila; esta clave agrupa las
-- configuraciones de un mismo modelo. Se agrupa por (brand, series_key).
--
-- Calculada por trigger desde `model`. `series_locked` protege correcciones manuales
-- (p.ej. gaming SKUs cuyo título lleva el código de unidad y el regexp no agrupa):
--   update laptops set series_key='Katana 15 HX', series_locked=true where ...;

alter table public.laptops add column if not exists series_key text;
alter table public.laptops add column if not exists series_locked boolean not null default false;

-- Corta el título en el primer token de specs y normaliza (trim + colapsar espacios).
-- immutable: depende solo del argumento, apto para índices y backfill.
create or replace function public.compute_series_key(p_model text)
returns text
language sql
immutable
as $$
  select nullif(
    btrim(regexp_replace(
      regexp_replace(
        p_model,
        '\s+(\d{1,2}([.,]\d)?\s?"|\d{1,2}([.,]\d)?\s?pulgadas|Intel|AMD|Ryzen|Snapdragon|Qualcomm|Apple\sM|Core|\d+\s?GB).*$',
        '', 'i'
      ),
      '\s+', ' ', 'g'
    )),
    ''
  );
$$;

-- Recalcula series_key al insertar, o al actualizar si cambió el modelo, salvo que
-- la fila esté bloqueada por una corrección manual.
create or replace function public.set_series_key()
returns trigger
language plpgsql
as $$
begin
  if new.series_locked then
    return new;
  end if;
  if (tg_op = 'INSERT') or (new.model is distinct from old.model) then
    new.series_key := public.compute_series_key(new.model);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_series_key on public.laptops;
create trigger trg_set_series_key
  before insert or update on public.laptops
  for each row execute function public.set_series_key();

-- Backfill de lo existente (respeta filas bloqueadas; al inicio no hay ninguna).
update public.laptops set series_key = public.compute_series_key(model) where not series_locked;

-- Índice para el GROUP BY del catálogo (solo visibles).
create index if not exists laptops_series_idx
  on public.laptops (brand, series_key) where discontinued_at is null;
```

- [ ] **Step 2: Aplicar la migración**

Run: `applysql db/migrations/0029_series_key.sql`
Expected: `[]` (sin error). Si devuelve `{"message": ...}` revisar el SQL.

- [ ] **Step 3: Verificar `compute_series_key` contra modelos reales (este es el test del SQL)**

Run:
```bash
runsql "select model, public.compute_series_key(model) as serie from (values
  ('ThinkPad T14 Gen 6 21ML 14\" Intel Core Ultra 5 16GB 512GB SSD'),
  ('EliteBook 6 G1i 13,3\" Intel Core Ultra 5 225U 16GB 512GB SSD'),
  ('Vivobook 15 X1504VA 15,6\" Intel Core 7 16GB'),
  ('Pro 14 Essential PV14250 14\" Full HD Intel'),
  ('MacBook Air 13\" Apple M3 8GB 256GB'),
  ('Katana 15 HX B14WGK-085XES 15.6\" Intel Core i9 32GB')
) v(model);"
```
Expected (columna `serie`):
- `ThinkPad T14 Gen 6 21ML`
- `EliteBook 6 G1i`
- `Vivobook 15 X1504VA`
- `Pro 14 Essential PV14250`
- `MacBook Air`
- `Katana 15 HX B14WGK-085XES`  ← singleton esperado (gaming SKU, ver spec)

- [ ] **Step 4: Verificar el backfill**

Run:
```bash
runsql "select count(*) total, count(series_key) con_key,
  count(*) filter (where series_key is null) sin_key from public.laptops;"
```
Expected: `con_key` ≈ total (los `sin_key` deben ser muy pocos — solo títulos que quedan vacíos tras el corte).

- [ ] **Step 5: Commit**

```bash
git add db/migrations/0029_series_key.sql
git commit -m "feat(db): series_key materializada por trigger para agrupar variantes"
```

---

## Task 2: Migración 0030 — `search_laptops` agrupado + `series_configs`

**Files:**
- Create: `db/migrations/0030_search_laptops_grouped.sql`

- [ ] **Step 1: Escribir la migración**

Crear `db/migrations/0030_search_laptops_grouped.sql`:

```sql
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
```

- [ ] **Step 2: Aplicar la migración**

Run: `applysql db/migrations/0030_search_laptops_grouped.sql`
Expected: `[]` (sin error).

- [ ] **Step 3: Verificar que search_laptops agrupa (EliteBook 6 G1i debe salir con config_count > 1)**

Run:
```bash
runsql "select brand, series_key, config_count, min_price, ram_min, ram_max,
  storage_min, storage_max, array_length(cpus,1) as n_cpus
from public.search_laptops(p_brands => array['HP'], p_sort => 'price_asc', p_limit => 50)
where series_key like 'EliteBook 6 G1i';"
```
Expected: una fila con `config_count` > 1 y rangos coherentes (ram_min ≤ ram_max, etc.).

- [ ] **Step 4: Verificar series_configs de esa serie**

Run:
```bash
runsql "select count(*) from public.series_configs('HP','EliteBook 6 G1i');"
```
Expected: un count > 1 que coincide aproximadamente con el `config_count` del paso anterior (sin filtros extra, coinciden).

- [ ] **Step 5: Verificar paginación por serie (total_count = nº de series)**

Run:
```bash
runsql "select (select total_count from public.search_laptops(p_limit => 1) limit 1) as primera_pagina_total;"
```
Expected: un número de varios miles (series), claramente menor que las ~4558 laptops activas.

- [ ] **Step 6: Commit**

```bash
git add db/migrations/0030_search_laptops_grouped.sql
git commit -m "feat(db): search_laptops agrupa por serie + series_configs para expandir"
```

---

## Task 3: Regenerar tipos de Supabase

**Files:**
- Modify (regenerado): `lib/supabase/database.types.ts`

- [ ] **Step 1: Regenerar**

Run: `npm run db:types`
Expected: el archivo `lib/supabase/database.types.ts` se reescribe sin error.

- [ ] **Step 2: Verificar typecheck (romperá en page.tsx — es esperado, se arregla en Task 5)**

Run: `npm run typecheck`
Expected: errores SOLO en `app/page.tsx` (campos que ya no encajan con el nuevo retorno). Si hay errores en otros archivos, investigar antes de seguir.

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/database.types.ts
git commit -m "chore(db): regenera tipos tras search_laptops agrupado"
```

---

## Task 4: Helpers de chips de rango (TDD)

**Files:**
- Create: `lib/series-chips.ts`
- Test: `lib/series-chips.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/series-chips.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { buildSeriesChips, formatStorage } from './series-chips';

describe('formatStorage', () => {
  it('formatea GB y TB', () => {
    expect(formatStorage(512)).toBe('512 GB');
    expect(formatStorage(1024)).toBe('1 TB');
    expect(formatStorage(2048)).toBe('2 TB');
  });
});

describe('buildSeriesChips', () => {
  it('valor único cuando min === max', () => {
    const chips = buildSeriesChips({
      ramMin: 16, ramMax: 16, storageMin: 512, storageMax: 512,
      screenMin: 14, screenMax: 14, cpus: ['Intel Core i5-1335U'], repCpu: 'Intel Core i5-1335U',
    });
    expect(chips).toEqual(['Core i5-1335U', '16 GB RAM', '512 GB SSD', '14″']);
  });

  it('rangos cuando min !== max', () => {
    const chips = buildSeriesChips({
      ramMin: 16, ramMax: 64, storageMin: 512, storageMax: 2048,
      screenMin: 14, screenMax: 16, cpus: ['Intel Core i5-1335U', 'Intel Core i9-13900H'],
      repCpu: 'Intel Core i5-1335U',
    });
    expect(chips).toContain('16–64 GB RAM');
    expect(chips).toContain('512 GB–2 TB SSD');
    expect(chips).toContain('14–16″');
  });

  it('CPU: rango i5–i9 cuando misma familia Core iX', () => {
    const chips = buildSeriesChips({
      ramMin: 16, ramMax: 16, storageMin: 512, storageMax: 512, screenMin: 14, screenMax: 14,
      cpus: ['Intel Core i5-1335U', 'Intel Core i7-1355U', 'Intel Core i9-13900H'],
      repCpu: 'Intel Core i5-1335U',
    });
    expect(chips[0]).toBe('Core i5–i9');
  });

  it('CPU: cae al representante si las familias se mezclan', () => {
    const chips = buildSeriesChips({
      ramMin: 16, ramMax: 16, storageMin: 512, storageMax: 512, screenMin: 14, screenMax: 14,
      cpus: ['Intel Core i5-1335U', 'AMD Ryzen 7 7735U'], repCpu: 'Intel Core i5-1335U',
    });
    expect(chips[0]).toBe('Core i5-1335U');
  });

  it('omite chips de campos nulos', () => {
    const chips = buildSeriesChips({
      ramMin: null, ramMax: null, storageMin: null, storageMax: null,
      screenMin: null, screenMax: null, cpus: [], repCpu: null,
    });
    expect(chips).toEqual([]);
  });
});
```

- [ ] **Step 2: Ejecutar el test para verle fallar**

Run: `npx vitest run lib/series-chips.test.ts`
Expected: FAIL ("Cannot find module './series-chips'").

- [ ] **Step 3: Implementar los helpers**

Crear `lib/series-chips.ts`:

```ts
// Chips de specs para las cards de SERIE del grid. A diferencia de una card de una
// sola configuración, una serie agrega varias: los numéricos se muestran como rango
// (min–max) y el CPU como rango de familia "Core i5–i9" cuando todas las CPUs son
// Intel Core iX; si las familias se mezclan, cae al CPU del representante (la config
// más barata). Funciones puras y testeables.

export type SeriesChipInput = {
  ramMin: number | null;
  ramMax: number | null;
  storageMin: number | null;
  storageMax: number | null;
  screenMin: number | null;
  screenMax: number | null;
  cpus: string[];
  repCpu: string | null;
};

// 512 → "512 GB"; 1024 → "1 TB"; 2048 → "2 TB".
export function formatStorage(gb: number): string {
  return gb >= 1024 && gb % 1024 === 0 ? `${gb / 1024} TB` : `${gb} GB`;
}

// "Intel Core i7-1355U" → "Core i7-1355U" (quita el fabricante para que quepa).
function shortCpu(cpu: string): string {
  return cpu.replace(/^(Intel|AMD|Apple)\s+/i, '').slice(0, 22);
}

// Nivel de un Intel Core iX: "Intel Core i7-1355U" → 7. null si no es Core iX.
function coreITier(cpu: string): number | null {
  const m = cpu.match(/core\s+i([3579])/i);
  return m ? Number(m[1]) : null;
}

function rangeNum(min: number, max: number, unit: string): string {
  return min === max ? `${min}${unit}` : `${min}–${max}${unit}`;
}

function cpuChip(cpus: string[], repCpu: string | null): string | null {
  if (cpus.length <= 1) return repCpu ? shortCpu(repCpu) : null;
  const tiers = cpus.map(coreITier);
  if (tiers.every((t): t is number => t !== null)) {
    const min = Math.min(...tiers);
    const max = Math.max(...tiers);
    return min === max ? `Core i${min}` : `Core i${min}–i${max}`;
  }
  return repCpu ? shortCpu(repCpu) : null;
}

// "512 GB–2 TB SSD": el extremo bajo se muestra sin unidad solo cuando ambos
// extremos comparten unidad final.
function storageRange(min: number, max: number): string {
  if (min === max) return `${formatStorage(min)} SSD`;
  const lo = formatStorage(min);
  const hi = formatStorage(max);
  const loText = lo.split(' ')[1] === hi.split(' ')[1] ? lo.split(' ')[0] : lo;
  return `${loText}–${hi} SSD`;
}

export function buildSeriesChips(input: SeriesChipInput): string[] {
  const chips: string[] = [];
  const cpu = cpuChip(input.cpus, input.repCpu);
  if (cpu) chips.push(cpu);
  if (input.ramMin !== null && input.ramMax !== null) {
    chips.push(rangeNum(input.ramMin, input.ramMax, ' GB RAM'));
  }
  if (input.storageMin !== null && input.storageMax !== null) {
    chips.push(storageRange(input.storageMin, input.storageMax));
  }
  if (input.screenMin !== null && input.screenMax !== null) {
    chips.push(rangeNum(input.screenMin, input.screenMax, '″'));
  }
  return chips;
}
```

- [ ] **Step 4: Ejecutar los tests hasta verde**

Run: `npx vitest run lib/series-chips.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add lib/series-chips.ts lib/series-chips.test.ts
git commit -m "feat: helpers puros de chips de rango para cards de serie"
```

---

## Task 5: Actualizar `app/page.tsx` al retorno agrupado

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Actualizar el tipo `SearchRow` y la card mapeada**

En `app/page.tsx`, reemplazar la definición de `SearchRow` (líneas ~21-30) por:

```ts
type SearchRow = {
  id: string;
  slug: string;
  brand: string;
  model: string;
  series_key: string | null;
  year: number | null;
  image_url: string | null;
  min_price: number | null;
  config_count: number;
  ram_min: number | null;
  ram_max: number | null;
  storage_min: number | null;
  storage_max: number | null;
  screen_min: number | null;
  screen_max: number | null;
  cpus: string[] | null;
  rep_cpu: string | null;
  total_count: number;
};
```

- [ ] **Step 2: Eliminar la query de specs aparte y mapear los nuevos campos**

En `app/page.tsx`, borrar el bloque que consulta `specs` por id (líneas ~158-169, desde `const laptops = rows ?? [];` hasta el `for (const s of specsData ?? [])`), dejando:

```ts
  const laptops = rows ?? [];
```

Eliminar también el import/uso de `SpecRow` (tipo y la query). Borrar el tipo `SpecRow` (líneas ~14-17). Si tras borrar `SpecRow` el import `import type { Tables } from '@/lib/supabase/database.types';` (línea ~9) queda sin uso, eliminarlo también (ESLint falla con imports sin usar).

Cambiar la firma de `renderPage` para no recibir `specsByLaptop` y actualizar su llamada. En el `cards` mapping dentro de `renderPage`, reemplazar el `.map` por:

```ts
  const cards: SeriesCard[] = laptops.map((l) => ({
    id: l.id,
    slug: l.slug,
    brand: l.brand,
    model: l.model,
    seriesKey: l.series_key,
    year: l.year,
    image_url: l.image_url,
    minPriceEur: l.min_price,
    configCount: Number(l.config_count),
    chipInput: {
      ramMin: l.ram_min,
      ramMax: l.ram_max,
      storageMin: l.storage_min,
      storageMax: l.storage_max,
      screenMin: l.screen_min,
      screenMax: l.screen_max,
      cpus: l.cpus ?? [],
      repCpu: l.rep_cpu,
    },
  }));
```

Importar el tipo desde el grid: `import { LaptopGrid, type SeriesCard } from '@/components/laptop-grid';` (reemplaza el import previo de `LaptopCard`).

- [ ] **Step 3: Ajustar el texto del contador**

El contador (línea ~243) cuenta series ahora. Cambiar el literal a:

```tsx
                : `${totalCount} ${totalCount === 1 ? 'serie' : 'series'} · página ${currentPage} de ${totalPages}`}
```

- [ ] **Step 4: Verificar typecheck (fallará en laptop-grid hasta Task 7; el resto debe pasar)**

Run: `npm run typecheck`
Expected: errores SOLO relacionados con `SeriesCard`/`LaptopGrid` en `components/laptop-grid.tsx` (aún sin actualizar). `app/page.tsx` ya no debe dar errores propios.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "feat: home consume search_laptops agrupado (una fila por serie)"
```

---

## Task 6: Route handler `series_configs`

**Files:**
- Create: `app/api/series/configs/route.ts`

- [ ] **Step 1: Implementar el route handler**

Crear `app/api/series/configs/route.ts`:

```ts
import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

// Configuraciones de una serie, para el expandir inline del grid. Reaplica los
// mismos filtros que la home (vienen en la query) para que la lista sea coherente.
export type SeriesConfigRow = {
  id: string;
  slug: string;
  brand: string;
  model: string;
  year: number | null;
  image_url: string | null;
  min_price: number | null;
  cpu: string | null;
  ram_gb: number | null;
  storage_gb: number | null;
  screen_inches: number | null;
};

const SCREEN_BUCKETS: Record<string, { min: number; max: number | null }> = {
  '13': { min: 12, max: 13.9 },
  '14': { min: 14, max: 14.9 },
  '15-16': { min: 15, max: 16.9 },
  '17': { min: 17, max: null },
};

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const p = url.searchParams;
  const brand = p.get('brand');
  const series = p.get('series');
  if (!brand || !series) {
    return NextResponse.json({ error: 'brand y series son obligatorios' }, { status: 400 });
  }

  const refurbished = p.get('cond') === 'nuevos' ? false : p.get('cond') === 'reacond' ? true : undefined;
  const screen = SCREEN_BUCKETS[p.get('screen') ?? ''];
  const ramMin = Number(p.get('ram_min')) || 0;
  const priceMax = Number(p.get('price_max')) || undefined;

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc('series_configs', {
      p_brand: brand,
      p_series_key: series,
      p_q: p.get('q')?.trim() || undefined,
      p_ram_min: ramMin,
      p_price_max: priceMax,
      p_gaming: p.get('gaming') === '1',
      p_ai: p.get('ai') === '1',
      p_oled: p.get('oled') === '1',
      p_refurbished: refurbished,
      p_screen_min: screen?.min,
      p_screen_max: screen?.max ?? undefined,
      p_product_line: p.get('line')?.trim() || undefined,
    })
    .returns<SeriesConfigRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ configs: data ?? [] });
}
```

- [ ] **Step 2: Verificar typecheck del handler**

Run: `npm run typecheck`
Expected: sin errores nuevos en `app/api/series/configs/route.ts` (los de `laptop-grid` siguen hasta Task 7).

- [ ] **Step 3: Commit**

```bash
git add app/api/series/configs/route.ts
git commit -m "feat: route handler /api/series/configs para expandir series"
```

---

## Task 7: Extraer card de configuración reutilizable

**Files:**
- Create: `components/laptop-card-item.tsx`

- [ ] **Step 1: Crear el componente de card de una configuración**

Extrae la card actual (imagen + chips + precio + checkbox + link) a un componente reutilizable, usado por las series singleton y por las configs expandidas. Crear `components/laptop-card-item.tsx`:

```tsx
'use client';

import { Check, Plus } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { pccThumb } from '@/lib/images';
import { useCompareSelection } from '@/lib/use-compare-selection';

// Una card de configuración concreta (un laptop_id real). Lleva el checkbox de
// comparar y enlaza a su ficha. La usan las series con 1 sola config y las configs
// expandidas de una serie multi-config.
export type CardItem = {
  id: string;
  slug: string;
  brand: string;
  model: string;
  image_url: string | null;
  minPriceEur: number | null;
  chips: string[];
};

export function LaptopCardItem({ item, backQuery }: { item: CardItem; backQuery?: string }) {
  const { toggle, isSelected, isFull } = useCompareSelection();
  const selected = isSelected(item.id);
  const disabled = !selected && isFull;
  const refurbished = item.slug.endsWith('-refurbished');

  return (
    <li
      className={
        'group relative flex flex-col overflow-hidden rounded-2xl border bg-white transition-all duration-300 hover:-translate-y-1 dark:bg-zinc-950 ' +
        (selected
          ? 'border-cyan-500 shadow-lg shadow-cyan-500/20 ring-1 ring-cyan-500/40'
          : 'border-zinc-200 shadow-sm hover:border-zinc-300 hover:shadow-xl hover:shadow-zinc-900/10 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:shadow-black/50')
      }
    >
      <span
        aria-hidden
        className={
          'absolute inset-x-0 top-0 z-20 h-0.5 bg-gradient-to-r from-cyan-400 via-cyan-300 to-emerald-300 transition-opacity duration-300 ' +
          (selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')
        }
      />
      <button
        type="button"
        onClick={() => toggle({ id: item.id, brand: item.brand, model: item.model, image_url: item.image_url })}
        disabled={disabled}
        aria-pressed={selected}
        aria-label={selected ? 'Quitar de la comparativa' : 'Añadir a comparar'}
        title={
          disabled
            ? 'Máximo alcanzado: quita alguno para añadir este'
            : selected
              ? 'Quitar de la comparativa'
              : 'Añadir a comparar'
        }
        className={
          'a11y-tap absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full border text-sm font-bold shadow-sm backdrop-blur transition-all ' +
          (selected
            ? 'border-cyan-500 bg-cyan-500 text-white shadow-cyan-500/30'
            : 'border-zinc-200 bg-white/80 text-zinc-400 hover:border-cyan-400 hover:text-cyan-600 dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-500 dark:hover:text-cyan-400') +
          (disabled ? ' cursor-not-allowed opacity-40' : '')
        }
      >
        {selected ? <Check className="h-4 w-4" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
      </button>

      <Link
        href={backQuery ? `/portatiles/${item.slug}?from=${encodeURIComponent(backQuery)}` : `/portatiles/${item.slug}`}
        className="flex flex-1 flex-col"
      >
        <div className="relative h-48 w-full overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_50%_0%,var(--color-zinc-100),var(--color-white))] dark:bg-[radial-gradient(120%_120%_at_50%_0%,var(--color-zinc-800),var(--color-zinc-950))]" />
          {refurbished && (
            <span className="absolute left-3 top-3 z-10 rounded-full bg-amber-100/90 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 shadow-sm backdrop-blur dark:bg-amber-950/90 dark:text-amber-300">
              Reacondicionado
            </span>
          )}
          {item.image_url ? (
            <Image
              src={pccThumb(item.image_url, 300)}
              alt={`${item.brand} ${item.model}`}
              fill
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="relative object-contain p-5 drop-shadow-md transition-transform duration-500 ease-out group-hover:scale-[1.06]"
            />
          ) : (
            <div className="relative flex h-full items-center justify-center text-xs text-zinc-400">Sin imagen</div>
          )}
        </div>

        <div className="flex flex-1 flex-col border-t border-zinc-100 p-4 dark:border-zinc-900">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-400">
            {item.brand}
          </p>
          <h2 className="mt-0.5 truncate font-display text-lg font-bold leading-tight">{item.model}</h2>

          {item.chips.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {item.chips.map((c) => (
                <li
                  key={c}
                  className="rounded-md bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
                >
                  {c}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-auto pt-4">
            {item.minPriceEur !== null ? (
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs text-zinc-500">Desde</span>
                <span className="font-display text-2xl font-extrabold tracking-tight tabular-nums">
                  {formatEur(item.minPriceEur)}
                </span>
              </div>
            ) : (
              <span className="text-xs text-zinc-400">Sin precio aún</span>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}

export function formatEur(value: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npm run typecheck`
Expected: sin errores nuevos en `components/laptop-card-item.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/laptop-card-item.tsx
git commit -m "refactor: extrae LaptopCardItem reutilizable para cards de config"
```

---

## Task 8: Reescribir `laptop-grid.tsx` con cards de serie + expandir inline

**Files:**
- Modify: `components/laptop-grid.tsx` (reescritura completa)

- [ ] **Step 1: Reescribir el componente**

Reemplazar TODO el contenido de `components/laptop-grid.tsx` por:

```tsx
'use client';

import { ChevronDown, Layers } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';

import { pccThumb } from '@/lib/images';
import { buildSeriesChips, type SeriesChipInput } from '@/lib/series-chips';
import { LaptopCardItem, formatEur, type CardItem } from '@/components/laptop-card-item';
import type { SeriesConfigRow } from '@/app/api/series/configs/route';

// Una fila del grid = una SERIE (devuelta por search_laptops). Si configCount === 1
// se pinta como card de configuración normal (con checkbox de comparar). Si > 1, card
// de serie con badge "N configuraciones" que expande inline las configs (lazy).
export type SeriesCard = {
  id: string;
  slug: string;
  brand: string;
  model: string;
  seriesKey: string | null;
  year: number | null;
  image_url: string | null;
  minPriceEur: number | null;
  configCount: number;
  chipInput: SeriesChipInput;
};

export function LaptopGrid({ laptops, backQuery }: { laptops: SeriesCard[]; backQuery?: string }) {
  return (
    <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {laptops.map((s) =>
        s.configCount > 1 ? (
          <SeriesGroupCard key={`${s.brand}|${s.seriesKey ?? s.id}`} series={s} backQuery={backQuery} />
        ) : (
          <LaptopCardItem
            key={s.id}
            item={{
              id: s.id,
              slug: s.slug,
              brand: s.brand,
              model: s.model,
              image_url: s.image_url,
              minPriceEur: s.minPriceEur,
              chips: buildSeriesChips(s.chipInput),
            }}
            backQuery={backQuery}
          />
        ),
      )}
    </ul>
  );
}

function SeriesGroupCard({ series, backQuery }: { series: SeriesCard; backQuery?: string }) {
  const [open, setOpen] = useState(false);
  const [configs, setConfigs] = useState<SeriesConfigRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const chips = buildSeriesChips(series.chipInput);

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && configs === null && !loading) {
      setLoading(true);
      setError(false);
      try {
        const params = new URLSearchParams(backQuery ?? '');
        params.set('brand', series.brand);
        params.set('series', series.seriesKey ?? series.id);
        const res = await fetch(`/api/series/configs?${params.toString()}`);
        if (!res.ok) throw new Error('fetch failed');
        const json = (await res.json()) as { configs: SeriesConfigRow[] };
        setConfigs(json.configs);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <li className="sm:col-span-2 lg:col-span-3">
      <button
        type="button"
        onClick={toggleOpen}
        aria-expanded={open}
        className="flex w-full items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-3 text-left shadow-sm transition-all hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
      >
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-zinc-50 dark:bg-zinc-900">
          {series.image_url ? (
            <Image
              src={pccThumb(series.image_url, 300)}
              alt={`${series.brand} ${series.model}`}
              fill
              sizes="80px"
              className="object-contain p-2"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[10px] text-zinc-400">Sin imagen</div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-400">
            {series.brand}
          </p>
          <h2 className="truncate font-display text-base font-bold leading-tight">
            {series.seriesKey ?? series.model}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2 py-0.5 text-[11px] font-semibold text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">
              <Layers className="h-3 w-3" aria-hidden /> {series.configCount} configuraciones
            </span>
            {chips.slice(0, 3).map((c) => (
              <span
                key={c}
                className="rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
              >
                {c}
              </span>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1 pr-1">
          {series.minPriceEur !== null && (
            <span className="font-display text-lg font-extrabold tabular-nums">
              <span className="mr-1 text-xs font-normal text-zinc-500">Desde</span>
              {formatEur(series.minPriceEur)}
            </span>
          )}
          <ChevronDown
            className={'h-5 w-5 text-zinc-400 transition-transform ' + (open ? 'rotate-180' : '')}
            aria-hidden
          />
        </div>
      </button>

      {open && (
        <div className="mt-3">
          {loading && <p className="px-1 text-sm text-zinc-500">Cargando configuraciones…</p>}
          {error && <p className="px-1 text-sm text-red-600">No se pudieron cargar las configuraciones.</p>}
          {configs && configs.length > 0 && (
            <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {configs.map((c) => (
                <LaptopCardItem
                  key={c.id}
                  item={{
                    id: c.id,
                    slug: c.slug,
                    brand: c.brand,
                    model: c.model,
                    image_url: c.image_url,
                    minPriceEur: c.min_price,
                    chips: buildConfigChips(c),
                  }}
                  backQuery={backQuery}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

// Chips de una configuración concreta (valores únicos, no rango).
function buildConfigChips(c: SeriesConfigRow): string[] {
  const chips: string[] = [];
  if (c.cpu) chips.push(c.cpu.replace(/^(Intel|AMD|Apple)\s+/i, '').slice(0, 22));
  if (c.ram_gb !== null) chips.push(`${c.ram_gb} GB RAM`);
  if (c.storage_gb !== null) chips.push(`${c.storage_gb} GB SSD`);
  if (c.screen_inches !== null) chips.push(`${c.screen_inches}″`);
  return chips;
}
```

- [ ] **Step 2: Verificar typecheck y lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS, sin errores.

- [ ] **Step 3: Ejecutar toda la suite de tests**

Run: `npm test`
Expected: PASS (incluye `lib/series-chips.test.ts` y los tests existentes).

- [ ] **Step 4: Commit**

```bash
git add components/laptop-grid.tsx
git commit -m "feat: grid con cards de serie expandibles inline (B1)"
```

---

## Task 9: Verificación manual en local y cierre

**Files:** (ninguno — verificación)

- [ ] **Step 1: Arrancar el dev server**

Run: `npm run dev`
Abrir `http://localhost:3000`.

- [ ] **Step 2: Comprobar visualmente**

Verificar en la home:
- Las series con varias configuraciones salen como card de serie con badge "N configuraciones" y chips de rango (ej. "16–64 GB RAM").
- Al pulsar una serie, se expanden inline sus configuraciones, cada una con su checkbox.
- Las series con 1 sola config se ven como card normal (con checkbox, enlace a ficha) — sin badge.
- Seleccionar 2 configuraciones (de la misma serie y de distintas) y comprobar que la CompareBar y `/comparar` funcionan igual que antes.
- Aplicar un filtro (p.ej. RAM ≥ 32GB + precio máx) y comprobar que los rangos y el contador de configuraciones de cada serie reflejan solo las configs que pasan el filtro.

- [ ] **Step 3: Verificación final de calidad (lo que corre CI)**

Run: `npm run lint && npm run typecheck && npm test`
Expected: todo PASS.

- [ ] **Step 4: Abrir el PR**

```bash
git push -u origin feat/agrupar-series
gh pr create --fill
```

Esperar CI verde (Lint+Typecheck). Mergear con `gh pr merge --squash --delete-branch` y luego `git checkout main && git pull`.

---

## Notas para después del merge (fuera de este plan)

- **Documentación de vault:** crear nota técnica `NN-agrupacion-por-serie.md` y entrada de bitácora (regla del proyecto).
- **Correcciones de `series_key`:** revisar los gaming SKUs (MSI Katana, etc.) y, si molestan como singletons, agruparlos a mano con `series_locked=true`.
- **Sub-proyecto A (cruft de slug):** ~151 filas viejas descatalogadas duplicadas, pendientes de fusión preservando histórico de precios. No entra aquí.
```
