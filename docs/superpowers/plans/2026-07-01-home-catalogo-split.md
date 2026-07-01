# Reestructura home/catálogo + exclusión de Chromebooks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La portada (`/`) muestra solo hero + Chollos/Destacados/Novedades + un CTA al catálogo; el catálogo completo se muda a `/catalogo`; y los Chromebooks se excluyen de las tres secciones (pero siguen en el catálogo).

**Architecture:** Split de rutas: `app/page.tsx` queda como landing ligera; se crea `app/catalogo/page.tsx` con toda la lógica de `search_laptops`/filtros/paginación que hoy vive en la portada. El hero (`HomeHero`) se reutiliza en ambas y adapta su buscador por `pathname`. Una migración SQL `0044` añade un filtro anti-Chromebook a las tres RPCs de sección sin tocar `search_laptops`.

**Tech Stack:** Next.js 16 App Router (Server Components + un Client Component para el hero), Supabase Postgres (RPC vía Management API), Tailwind v4, Playwright (e2e), Vitest (unit). Repo CRLF — **no** `prettier --write`; verificar con `npm run lint` + `npm run typecheck` + `npm test` + `npm run e2e`.

**Spec:** `docs/superpowers/specs/2026-07-01-home-catalogo-split-design.md`

---

## File structure

- **Create** `db/migrations/0044_exclude_chromebooks.sql` — `create or replace` de `home_deals`, `home_featured`, `home_novedades` con filtro anti-Chromebook.
- **Create** `app/catalogo/page.tsx` — catálogo completo (copia de la portada actual, ajustada).
- **Modify** `app/page.tsx` — reducida a landing (hero + secciones + CTA).
- **Modify** `components/home-hero.tsx` — buscador adaptativo por `pathname`.
- **Modify** `components/back-to-catalog.tsx` — enlaces `/` → `/catalogo`.
- **Modify** `components/nav-bar.tsx` — nuevo enlace "Catálogo".
- **Modify** `e2e/home.spec.ts`, `e2e/filters.spec.ts`, `e2e/mobile-filters.spec.ts`, `e2e/detail.spec.ts`.
- **Create** `e2e/catalogo.spec.ts`.

Cada paso de migración usa el PAT de `.env.local` (patrón ya usado en el repo):

```bash
PAT=$(grep -E '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2- | tr -d '"'\''\r')
API="https://api.supabase.com/v1/projects/uhnbfyjapxbmifyeacly/database/query"
```

---

### Task 1: Migración 0044 — excluir Chromebooks de las tres secciones

**Files:**
- Create: `db/migrations/0044_exclude_chromebooks.sql`

- [ ] **Step 1: Crear la migración** con EXACTAMENTE este contenido (las tres funciones son las definiciones **vivas** en la DB — `home_featured`/`home_novedades` ya incluyen el `exists(affiliate_links…)` de la migración 0042 — con una sola línea añadida en cada `where`):

```sql
-- 0044_exclude_chromebooks.sql
-- Excluye Chromebooks de las TRES secciones de la home (home_deals/home_featured/home_novedades).
-- Detección validada contra el dato real: model ~* 'chromebook' (58) ∪ slug ~* 'chromebook|chromeos'
-- = 60 equipos (incl. 2 Lenovo "Chrome 2in1" sin "chromebook" en el modelo). search_laptops NO se
-- toca → los Chromebooks siguen en /catalogo. Filtro añadido: 
--   and l.model !~* 'chromebook' and l.slug !~* 'chromebook|chromeos'

-- 1) Chollos
create or replace function public.home_deals(
  p_limit int default 12,
  p_min_drop_pct int default 8,
  p_window_days int default 45,
  p_ref_percentile numeric default 0.5,
  p_max_drop_pct int default 30
)
returns table (
  id uuid, slug text, brand text, model text, image_url text,
  current_price_eur numeric, old_price_eur numeric, drop_pct int,
  ram_gb smallint, cpu text, screen_inches numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with recent as materialized (
    select ph.laptop_id, ph.retailer_id, ph.price_eur, ph.observed_at
    from public.prices_history ph
    where ph.observed_at >= now() - make_interval(days => p_window_days)
  ),
  current_per_retailer as (
    select distinct on (r.laptop_id, r.retailer_id)
      r.laptop_id, r.price_eur, r.observed_at
    from recent r
    order by r.laptop_id, r.retailer_id, r.observed_at desc
  ),
  cur as (
    select laptop_id, min(price_eur) as current_price, max(observed_at) as last_seen
    from current_per_retailer group by laptop_id
  ),
  ref as (
    select laptop_id,
      percentile_cont(p_ref_percentile) within group (order by price_eur)::numeric as old_price
    from recent group by laptop_id
  ),
  deals as (
    select
      c.laptop_id, c.current_price, r.old_price, c.last_seen,
      round((r.old_price - c.current_price) / nullif(r.old_price, 0) * 100)::int as drop_pct
    from cur c join ref r on r.laptop_id = c.laptop_id
  )
  select
    l.id, l.slug, l.brand, l.model, l.image_url,
    d.current_price as current_price_eur, d.old_price as old_price_eur, d.drop_pct,
    s.ram_gb, s.cpu, s.screen_inches
  from deals d
  join public.laptops l on l.id = d.laptop_id
  left join public.specs s on s.laptop_id = l.id
  where l.discontinued_at is null
    and d.last_seen >= now() - interval '7 days'
    and d.old_price > d.current_price
    and d.drop_pct >= p_min_drop_pct
    and d.drop_pct <= p_max_drop_pct
    and l.model !~* 'chromebook' and l.slug !~* 'chromebook|chromeos'
  order by d.drop_pct desc, d.current_price asc
  limit p_limit;
$$;

grant execute on function public.home_deals(int, int, int, numeric, int) to anon, authenticated;

-- 2) Destacados
create or replace function public.home_featured(p_limit int default 8)
returns table (
  id uuid, slug text, brand text, model text, image_url text,
  current_price_eur numeric, ram_gb smallint, cpu text, screen_inches numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with feat as (
    select l.id, l.slug, l.brand, l.model, l.image_url, l.featured_rank
    from public.laptops l
    where l.featured_rank is not null
      and l.discontinued_at is null
      and l.model !~* 'chromebook' and l.slug !~* 'chromebook|chromeos'
      and exists (
        select 1 from public.affiliate_links al
        where al.laptop_id = l.id and al.active and al.unavailable_at is null
      )
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
    select laptop_id, min(price_eur) as current_price from latest group by laptop_id
  )
  select
    f.id, f.slug, f.brand, f.model, f.image_url,
    c.current_price as current_price_eur, s.ram_gb, s.cpu, s.screen_inches
  from feat f
  left join cur c on c.laptop_id = f.id
  left join public.specs s on s.laptop_id = f.id
  order by f.featured_rank;
$$;

grant execute on function public.home_featured(int) to anon, authenticated;

-- 3) Novedades
create or replace function public.home_novedades(p_limit int default 12)
returns table (
  id uuid, slug text, brand text, model text, image_url text,
  current_price_eur numeric, ram_gb smallint, cpu text, screen_inches numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with per_brand as (
    select distinct on (l.brand)
      l.id, l.slug, l.brand, l.model, l.image_url, l.created_at
    from public.laptops l
    where l.discontinued_at is null
      and l.image_url is not null
      and l.refurbished = false
      and l.model !~* '(servicio|suscrip|garant|licencia|seguro|microsoft 365)'
      and l.model !~* 'chromebook' and l.slug !~* 'chromebook|chromeos'
      and exists (
        select 1 from public.affiliate_links al
        where al.laptop_id = l.id and al.active and al.unavailable_at is null
      )
    order by l.brand, l.created_at desc
  ),
  nuevos as (
    select * from per_brand order by created_at desc limit 30
  ),
  latest as (
    select distinct on (ph.laptop_id, ph.retailer_id) ph.laptop_id, ph.price_eur
    from public.prices_history ph
    where ph.laptop_id in (select id from nuevos)
    order by ph.laptop_id, ph.retailer_id, ph.observed_at desc
  ),
  cur as (
    select laptop_id, min(price_eur) as current_price from latest group by laptop_id
  )
  select
    n.id, n.slug, n.brand, n.model, n.image_url,
    c.current_price as current_price_eur, s.ram_gb, s.cpu, s.screen_inches
  from nuevos n
  join cur c on c.laptop_id = n.id
  left join public.specs s on s.laptop_id = n.id
  order by n.created_at desc
  limit p_limit;
$$;

grant execute on function public.home_novedades(int) to anon, authenticated;
```

- [ ] **Step 2: Aplicar vía Management API**

```bash
PAT=$(grep -E '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2- | tr -d '"'\''\r')
SQL=$(python -c 'import json,sys; print(json.dumps(open(sys.argv[1],encoding="utf-8").read()))' db/migrations/0044_exclude_chromebooks.sql)
curl -s -X POST "https://api.supabase.com/v1/projects/uhnbfyjapxbmifyeacly/database/query" \
  -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" -d "{\"query\": $SQL}"
```
Expected: `[]` (create-or-replace sin filas).

- [ ] **Step 3: Verificar 0 Chromebooks en las tres RPCs**

```bash
PAT=$(grep -E '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2- | tr -d '"'\''\r')
curl -s -X POST "https://api.supabase.com/v1/projects/uhnbfyjapxbmifyeacly/database/query" \
  -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
  -d '{"query":"select
    (select count(*) from public.home_deals(1000) d where d.slug ~* '"'"'chromebook|chromeos'"'"' or d.model ~* '"'"'chromebook'"'"') as deals_cb,
    (select count(*) from public.home_featured(1000) f where f.slug ~* '"'"'chromebook|chromeos'"'"' or f.model ~* '"'"'chromebook'"'"') as feat_cb,
    (select count(*) from public.home_novedades(1000) n where n.slug ~* '"'"'chromebook|chromeos'"'"' or n.model ~* '"'"'chromebook'"'"') as nov_cb;"}'
```
Expected: `[{"deals_cb":0,"feat_cb":0,"nov_cb":0}]`. (Y que `search_laptops` sigue con Chromebooks: opcional, ver `select count(*) from search_laptops(...)` no cambia — no es necesario verificarlo aquí.)

- [ ] **Step 4: Commit**

```bash
git add db/migrations/0044_exclude_chromebooks.sql
git commit -m "feat(db): excluye Chromebooks de las secciones de la home (migr. 0044)"
```

---

### Task 2: Ruta `/catalogo` — mudar el catálogo completo

**Files:**
- Create: `app/catalogo/page.tsx`

- [ ] **Step 1: Copiar la portada actual como base del catálogo**

```bash
mkdir -p app/catalogo
cp app/page.tsx app/catalogo/page.tsx
```

- [ ] **Step 2: Quitar SOLO las tres secciones del catálogo** (son de la portada; el banner `?message=` y todo lo demás se dejan intactos). En `app/catalogo/page.tsx`:

Borrar las líneas de import:
```ts
import { DealsSection } from '@/components/deals-section';
import { FeaturedSection } from '@/components/featured-section';
import { NovedadesSection } from '@/components/novedades-section';
```

Y en `renderPage`, borrar este bloque (dejando el banner de `message` y el resto tal cual):
```tsx
      <DealsSection />

      <FeaturedSection />

      <NovedadesSection />

```
(Es decir, tras el bloque `{message && (…)}` viene directamente el comentario `{/* Móvil (<md): filtros… */}`.)

- [ ] **Step 3: La paginación del catálogo apunta a `/catalogo`.** En `app/catalogo/page.tsx`, en el `<Pagination>`:

Reemplazar:
```tsx
            basePath="/"
```
por:
```tsx
            basePath="/catalogo"
```

- [ ] **Step 4: `buildCatalogQuery` sigue igual** (ya serializa los filtros; el `?from=` de las cards se resuelve en `BackToCatalog`, Task 5). No hay más cambios. `message`, `HomeHero`, la cabecera "Explora el catálogo", filtros, orden, `EmptyState` y `ErrorBox` se quedan como están en la copia.

- [ ] **Step 5: Lint + typecheck**

Run: `npm run lint; npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/catalogo/page.tsx
git commit -m "feat(catalogo): nueva ruta /catalogo con el catálogo completo (movido de la portada)"
```

---

### Task 3: Portada `/` reducida a hero + secciones + CTA

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Reemplazar TODO el contenido de `app/page.tsx`** por esta landing ligera:

```tsx
import { ArrowRight, Sparkles } from 'lucide-react';
import Link from 'next/link';

import { DealsSection } from '@/components/deals-section';
import { FeaturedSection } from '@/components/featured-section';
import { HomeHero } from '@/components/home-hero';
import { NovedadesSection } from '@/components/novedades-section';

// Portada: hero + escaparate curado (Chollos/Destacados/Novedades) + CTA al catálogo
// completo. El catálogo con filtros/paginación vive en /catalogo (app/catalogo/page.tsx).
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;

  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-8">
      <HomeHero />

      {message && (
        <div className="mb-4 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-100">
          {message}
        </div>
      )}

      <DealsSection />

      <FeaturedSection />

      <NovedadesSection />

      <section className="mt-4 mb-10 overflow-hidden rounded-3xl border border-zinc-200 bg-gradient-to-br from-zinc-50 to-white p-8 text-center dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-950">
        <Sparkles className="mx-auto h-6 w-6 text-cyan-500" aria-hidden />
        <h2 className="mt-3 font-display text-2xl font-bold tracking-tight">
          Explora todo el catálogo
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
          Filtra por marca, precio, RAM, pantalla y más entre los +3.800 modelos, y marca 2-4 para
          compararlos lado a lado.
        </p>
        <Link
          href="/catalogo"
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-700"
        >
          Explorar el catálogo <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Lint + typecheck**

Run: `npm run lint; npm run typecheck`
Expected: PASS (la portada ya no importa `LaptopGrid`/`Pagination`/`search_laptops`/etc.).

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat(home): portada = hero + secciones + CTA al catálogo (sin rejilla)"
```

---

### Task 4: Buscador adaptativo del hero

**Files:**
- Modify: `components/home-hero.tsx`

Contexto: `HomeHero` es un Client Component. Hoy: (a) un `useEffect` con debounce escribe `?q=` en la URL de la página actual mientras tecleas (filtrado en vivo); (b) `Enter` y el botón "Recomiéndame" llaman a `ask()` → `/asistente`. Cambios: el filtrado en vivo solo debe ocurrir en `/catalogo`; en `/` (portada) `Enter` navega a `/catalogo?q=…`.

- [ ] **Step 1: Añadir un `search()` que navega al catálogo y condicionar el debounce.** En `components/home-hero.tsx`:

Reemplazar el `useEffect` del debounce:
```tsx
  // Debounce del filtro en vivo hacia la URL (igual patrón que los filtros).
  useEffect(() => {
    const t = setTimeout(() => {
      if (q !== (searchParams.get('q') ?? '')) {
        const params = new URLSearchParams(searchParams.toString());
        if (q) params.set('q', q);
        else params.delete('q');
        params.delete('page');
        const next = params.toString();
        startTransition(() => {
          router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
        });
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
```
por:
```tsx
  // Filtrado en vivo SOLO en /catalogo (donde hay rejilla debajo). En la portada el
  // buscador no filtra en vivo: navega al catálogo al enviar (ver search()).
  useEffect(() => {
    if (pathname !== '/catalogo') return;
    const t = setTimeout(() => {
      if (q !== (searchParams.get('q') ?? '')) {
        const params = new URLSearchParams(searchParams.toString());
        if (q) params.set('q', q);
        else params.delete('q');
        params.delete('page');
        const next = params.toString();
        startTransition(() => {
          router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
        });
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // Búsqueda de texto desde la portada: lleva al catálogo ya filtrado por ?q=.
  function search() {
    const t = q.trim();
    router.push(t ? `/catalogo?q=${encodeURIComponent(t)}` : '/catalogo');
  }
```

- [ ] **Step 2: Enter bifurca por página.** En el `<input>`, reemplazar el `onKeyDown`:
```tsx
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                ask();
              }
            }}
```
por:
```tsx
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                // En la portada, Enter = búsqueda de texto → catálogo filtrado.
                // En /catalogo, se mantiene el comportamiento de hoy (Enter → IA).
                if (pathname === '/catalogo') ask();
                else search();
              }
            }}
```

- [ ] **Step 3: Lint + typecheck**

Run: `npm run lint; npm run typecheck`
Expected: PASS. (`pathname` ya está declarado con `usePathname()`; `search` usa `router` y `q`, ambos ya en scope.)

- [ ] **Step 4: Verificación manual rápida**

Run: `npm run dev`, abrir `http://localhost:3000`.
Expected: en la portada, escribir "Lenovo" + Enter → navega a `/catalogo?q=Lenovo` y la rejilla sale filtrada. En `/catalogo`, teclear filtra en vivo (como antes) y Enter va a `/asistente`. "Recomiéndame" va a `/asistente` en ambas.

- [ ] **Step 5: Commit**

```bash
git add components/home-hero.tsx
git commit -m "feat(home): el buscador del hero navega a /catalogo desde la portada (filtro en vivo solo en /catalogo)"
```

---

### Task 5: Enlaces de navegación

**Files:**
- Modify: `components/back-to-catalog.tsx`
- Modify: `components/nav-bar.tsx`

- [ ] **Step 1: `BackToCatalog` apunta a `/catalogo`.** En `components/back-to-catalog.tsx`:

Reemplazar:
```tsx
  const href = from ? `/?${from}` : '/';
```
por:
```tsx
  const href = from ? `/catalogo?${from}` : '/catalogo';
```

Y en `BackToCatalogFallback`, reemplazar:
```tsx
    <Link href="/" className={LINK_CLASS}>
```
por:
```tsx
    <Link href="/catalogo" className={LINK_CLASS}>
```

- [ ] **Step 2: Enlace "Catálogo" en el navbar.** En `components/nav-bar.tsx`, dentro de `<nav className="flex items-center gap-4 text-sm">`, insertar como PRIMER hijo (antes del enlace "Asistente IA"):

```tsx
          <Link
            href="/catalogo"
            className="font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Catálogo
          </Link>
```

- [ ] **Step 3: Lint + typecheck**

Run: `npm run lint; npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/back-to-catalog.tsx components/nav-bar.tsx
git commit -m "feat(nav): 'Volver al catálogo' y enlace del navbar apuntan a /catalogo"
```

---

### Task 6: e2e + suite completa

**Files:**
- Modify: `e2e/home.spec.ts`
- Modify: `e2e/filters.spec.ts`
- Modify: `e2e/mobile-filters.spec.ts`
- Modify: `e2e/detail.spec.ts`
- Create: `e2e/catalogo.spec.ts`

- [ ] **Step 1: Reorientar el primer test de `home.spec.ts`.** La portada ya no tiene rejilla ni contador. Reemplazar el primer test:
```ts
test('la home carga y muestra portátiles', async ({ page }) => {
  await page.goto('/');
  // Al menos una card enlaza a una ficha de portátil.
  await expect(page.locator('a[href^="/portatiles/"]').first()).toBeVisible();
  // El texto de contador de resultados aparece (o el de "sin resultados").
  await expect(page.getByText(/serie|resultado/i).first()).toBeVisible();
});
```
por:
```ts
test('la portada carga con hero y CTA al catálogo', async ({ page }) => {
  await page.goto('/');
  // El hero (buscador) está presente.
  await expect(page.getByLabel(/Busca un portátil/)).toBeVisible();
  // El CTA lleva al catálogo completo.
  await expect(page.getByRole('link', { name: /Explorar el catálogo/ })).toBeVisible();
});
```
(Los tres tests de secciones — Destacados/Novedades/Chollos, tolerantes — se dejan **sin cambios**.)

- [ ] **Step 2: `filters.spec.ts` arranca en `/catalogo`.** Reemplazar:
```ts
  await page.goto('/');
```
por:
```ts
  await page.goto('/catalogo');
```

- [ ] **Step 3: `mobile-filters.spec.ts` arranca en `/catalogo`.** Reemplazar:
```ts
  await page.goto('/');
```
por:
```ts
  await page.goto('/catalogo');
```

- [ ] **Step 4: `detail.spec.ts` arranca en `/catalogo`.** La rejilla del catálogo siempre tiene cards; reemplazar:
```ts
  await page.goto('/');
```
por:
```ts
  await page.goto('/catalogo');
```

- [ ] **Step 5: Crear `e2e/catalogo.spec.ts`:**

```ts
import { test, expect } from '@playwright/test';

test('el catálogo muestra portátiles y contador', async ({ page }) => {
  await page.goto('/catalogo');
  await expect(page.locator('a[href^="/portatiles/"]').first()).toBeVisible();
  await expect(page.getByText(/serie|resultado/i).first()).toBeVisible();
});

test('buscar en el hero de la portada lleva al catálogo filtrado', async ({ page }) => {
  await page.goto('/');
  const input = page.getByLabel(/Busca un portátil/);
  await input.fill('Lenovo');
  await input.press('Enter');
  await expect(page).toHaveURL(/\/catalogo\?q=Lenovo/i);
  // El catálogo respondió (rejilla o "sin resultados").
  await expect(page.getByText(/serie|resultado/i).first()).toBeVisible();
});
```

- [ ] **Step 6: Suite e2e**

Run: `npm run e2e`
Expected: PASS — `home.spec.ts` (portada + 3 secciones tolerantes), `catalogo.spec.ts` (2), `filters.spec.ts`, `mobile-filters.spec.ts`, `detail.spec.ts`.

- [ ] **Step 7: Suite completa (gate de CI)**

Run: `npm run lint; npm run typecheck; npm test; npm run e2e`
Expected: PASS en todo (unitarios de Vitest intactos; e2e en verde).

- [ ] **Step 8: Commit**

```bash
git add e2e/
git commit -m "test(e2e): portada sin catálogo, /catalogo con rejilla, y búsqueda del hero → /catalogo"
```

---

## Notas de implementación

- **CRLF**: no `prettier --write`. Verificar con lint + typecheck + vitest + e2e.
- **Migración por Management API** (PAT en `.env.local`), reflejada en `db/migrations/`.
- **No tocar `search_laptops`**: los Chromebooks permanecen en el catálogo por decisión.
- **Rama**: `feat/home-catalogo-split` (ya creada desde `main` con Chollos #91 mergeado).
- **Al cerrar**: nota de vault `39-home-catalogo-split.md` + entrada de bitácora + PR.
