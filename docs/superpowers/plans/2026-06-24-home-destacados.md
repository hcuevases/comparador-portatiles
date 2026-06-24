# Sección "Destacados" en la home — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir una sección "Destacados" (editorial, curada por `featured_rank`) entre el hero y el catálogo de la home, con el componente de fila reutilizable y reutilizando la card.

**Architecture:** Columna `laptops.featured_rank` + RPC `home_featured` → componente server `FeaturedSection` que la consulta → `<HomeRow>` con `LaptopCardItem`. Curado por SQL. Se oculta si no hay destacados.

**Tech Stack:** Next.js 16 App Router (Server Components), Supabase (RPC), Tailwind v4. Migración por Management API. CI = lint+typecheck+vitest+e2e (gate). Repo CRLF (no `prettier --write`).

**Spec:** `docs/superpowers/specs/2026-06-24-home-destacados-design.md`

---

### Task 1: Columna `featured_rank` + RPC `home_featured` + curado inicial

**Files:**
- Create: `db/migrations/0038_featured_laptops.sql`

- [ ] **Step 1: Crear la migración** con EXACTAMENTE:

```sql
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
```

- [ ] **Step 2: Aplicar vía Management API**

```bash
PAT=$(grep -E '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2- | tr -d '"'"'"'\r')
SQL=$(cat db/migrations/0038_featured_laptops.sql | python -c "import json,sys; print(json.dumps(sys.stdin.read()))")
curl -s -X POST "https://api.supabase.com/v1/projects/uhnbfyjapxbmifyeacly/database/query" \
  -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" -d "{\"query\": $SQL}"
```
Expected: `[]`.

- [ ] **Step 3: Elegir candidatos y curar (~6-8).** Listar candidatos con imagen y precio
  válidos, variados en marca/precio:

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/uhnbfyjapxbmifyeacly/database/query" \
  -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
  -d '{"query":"with latest as (select distinct on (laptop_id, retailer_id) laptop_id, price_eur from prices_history order by laptop_id, retailer_id, observed_at desc), cur as (select laptop_id, min(price_eur) p from latest group by laptop_id) select l.slug, l.brand, left(l.model,40) m, cur.p from laptops l join cur on cur.laptop_id=l.id where l.discontinued_at is null and l.image_url is not null and l.refurbished=false order by l.brand, cur.p desc limit 60;"}'
```
Elegir ~6-8 slugs (mezcla: una gama alta/Apple, un gaming, un value, etc.) y asignarles
`featured_rank` 1..N con un UPDATE (slugs reales del listado anterior):

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/uhnbfyjapxbmifyeacly/database/query" \
  -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
  -d '{"query":"update laptops set featured_rank = c.rank from (values (\"<slug1>\",1),(\"<slug2>\",2),(\"<slug3>\",3),(\"<slug4>\",4),(\"<slug5>\",5),(\"<slug6>\",6)) as c(slug,rank) where laptops.slug=c.slug;"}'
```
(Sustituir `<slugN>` por slugs reales. Comillas internas escapadas para el JSON.)

- [ ] **Step 4: Verificar `home_featured`:**

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/uhnbfyjapxbmifyeacly/database/query" \
  -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
  -d '{"query":"select brand, left(model,38) m, current_price_eur, ram_gb, cpu from public.home_featured(8);"}'
```
Expected: los 6-8 curados, en orden de `featured_rank`, con precio real (no null) y chips.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/0038_featured_laptops.sql
git commit -m "feat(db): featured_rank + RPC home_featured (destacados de la home)"
```

---

### Task 2: Componente `<HomeRow>`

**Files:**
- Create: `components/home-row.tsx`

- [ ] **Step 1: Crear `components/home-row.tsx`** (Server Component):

```tsx
import type { ReactNode } from 'react';

// Fila de cards para los feeds de la home (Destacados ahora; Chollos al retomar el sub-1).
// Scroll horizontal con snap en móvil; grid en ≥md. Los hijos son <li> (p.ej. LaptopCardItem).
export function HomeRow({
  title,
  icon,
  subtitle,
  children,
}: {
  title: string;
  icon?: ReactNode;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-10">
      <div className="mb-4 flex items-baseline gap-2">
        {icon}
        <h2 className="font-display text-xl font-bold tracking-tight">{title}</h2>
        {subtitle && <span className="text-sm text-zinc-500">{subtitle}</span>}
      </div>
      <ul className="flex snap-x gap-4 overflow-x-auto pb-2 [&>li]:min-w-[14rem] [&>li]:shrink-0 [&>li]:snap-start md:grid md:grid-cols-3 md:overflow-visible md:[&>li]:min-w-0 lg:grid-cols-4">
        {children}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: Lint + typecheck**

Run: `npm run lint; npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/home-row.tsx
git commit -m "feat(home): componente HomeRow (fila de cards reutilizable)"
```

---

### Task 3: `FeaturedSection` + cableado en la home

**Files:**
- Create: `components/featured-section.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Crear `components/featured-section.tsx`** (Server Component async):

```tsx
import { Star } from 'lucide-react';

import { createClient } from '@/lib/supabase/server';

import { HomeRow } from './home-row';
import { LaptopCardItem, type CardItem } from './laptop-card-item';

type FeaturedRow = {
  id: string;
  slug: string;
  brand: string;
  model: string;
  image_url: string | null;
  current_price_eur: number | null;
  ram_gb: number | null;
  cpu: string | null;
  screen_inches: number | null;
};

// Sección "Destacados": escaparate editorial (RPC home_featured). Se auto-consulta y se
// oculta si no hay curados o la RPC falla (no fatal).
export async function FeaturedSection() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('home_featured', { p_limit: 8 }).returns<FeaturedRow[]>();

  if (error || !data || data.length === 0) return null;

  return (
    <HomeRow
      title="Destacados"
      icon={<Star className="h-5 w-5 text-cyan-500" aria-hidden />}
    >
      {data.map((f) => {
        const chips = [
          f.cpu,
          f.ram_gb != null ? `${f.ram_gb} GB` : null,
          f.screen_inches != null ? `${f.screen_inches}"` : null,
        ].filter((c): c is string => Boolean(c));
        const item: CardItem = {
          id: f.id,
          slug: f.slug,
          brand: f.brand,
          model: f.model,
          image_url: f.image_url,
          minPriceEur: f.current_price_eur,
          chips,
        };
        return <LaptopCardItem key={f.id} item={item} />;
      })}
    </HomeRow>
  );
}
```

- [ ] **Step 2: Renderizar `<FeaturedSection />` en la home.** En `app/page.tsx`:
  1. Añadir el import junto a los demás de `@/components`:
     ```ts
     import { FeaturedSection } from '@/components/featured-section';
     ```
  2. En el JSX de `renderPage(...)`, insertar `<FeaturedSection />` **justo antes** del
     comentario `{/* Móvil (<md): filtros en bottom-sheet ... */}` (entre el hero y el bloque
     de catálogo / `<MobileFilters>`):
     ```tsx
           <FeaturedSection />

           {/* Móvil (<md): filtros en bottom-sheet abierto por un botón sticky. */}
           <MobileFilters brands={allBrands} productLines={productLines} total={totalCount} />
     ```

- [ ] **Step 3: Lint + typecheck**

Run: `npm run lint; npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Verificación manual (local)**

Run: `npm run dev` → `http://localhost:3000`.
Expected: aparece la sección **"Destacados"** entre el hero y el catálogo, con las cards
curadas (precio real, "+ comparar"), enlazando a su ficha. El catálogo/filtros siguen igual
debajo. (Si alguna card sale con imagen placeholder por thumbnail muerto, anotar el slug para
cambiarlo por otro destacado con imagen viva.)

- [ ] **Step 5: Commit**

```bash
git add components/featured-section.tsx app/page.tsx
git commit -m "feat(home): sección Destacados entre el hero y el catálogo"
```

---

### Task 4: e2e + suite completa

**Files:**
- Modify: `e2e/home.spec.ts`

- [ ] **Step 1: Añadir un test e2e tolerante:**

```ts
test('la sección Destacados, si aparece, muestra cards de portátil', async ({ page }) => {
  await page.goto('/');
  const destacados = page.getByRole('heading', { name: 'Destacados' });
  if (await destacados.count()) {
    const section = page.locator('section').filter({ has: destacados });
    await expect(section.locator('a[href^="/portatiles/"]').first()).toBeVisible();
  }
});
```

- [ ] **Step 2: Ejecutar el e2e**

Run: `npm run e2e -- e2e/home.spec.ts`
Expected: PASS (con los curados, la sección aparece y tiene cards).

- [ ] **Step 3: Suite completa (gate de CI)**

Run: `npm run lint; npm run typecheck; npm test; npm run e2e`
Expected: PASS — unitarios intactos y los e2e en verde.

- [ ] **Step 4: Commit** (si Step 1 dejó algo sin commitear).

```bash
git add e2e/home.spec.ts
git commit -m "test(e2e): la sección Destacados muestra cards (tolerante a que no haya)"
```

---

## Notas de implementación

- **CRLF**: no `prettier --write`. Verificar con lint + typecheck + vitest + e2e.
- **Migración por Management API**; reflejada en `db/migrations/`.
- **No tocar** la lógica del catálogo/filtros. La card es la misma (sin campos de oferta).
- **`<HomeRow>`** se crea aquí; la copia en la rama de chollos (en pausa) se reconcilia al
  retomar el sub-1 (renumerar su `0037_home_deals` a 0039+).
- **Curado**: por SQL ahora; panel de admin apuntado como mejora futura en el spec.
- **Rama**: `feat/home-destacados`. Al cerrar: nota de vault + bitácora.
