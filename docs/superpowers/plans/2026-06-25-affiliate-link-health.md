# Salud de enlaces de afiliado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detectar enlaces de afiliado de PcComponentes que devuelven 410/404, registrarlo en columnas propias de `affiliate_links`, y hacer que la home excluya esos productos y la ficha degrade (sin botón de compra).

**Architecture:** Un script Playwright manual (`scripts/check-links.ts`) prueba las URLs y escribe la salud en `affiliate_links.unavailable_at/checked_at/last_status`. El scraper no toca esas columnas. La ficha filtra `unavailable_at is null`; los RPCs de la home excluyen productos sin enlace vivo. La única lógica con ramas (`lib/link-health.ts`) se testea aislada.

**Tech Stack:** TypeScript, Playwright, Supabase (Postgres RPC `language sql`, Management API), Vitest, Next.js 16 App Router.

**Spec:** `docs/superpowers/specs/2026-06-25-affiliate-link-health-design.md`

**Refinamientos sobre el spec:** (1) el clasificador pasa de `classifyStatus(status)` a `classifyResponse(httpStatus, title)` para cubrir el soft-404 por título y el reto de Cloudflare (la ficha está tras Cloudflare intermitente). (2) La prioridad de selección se mueve a un RPC SQL (`affiliate_links_to_check`) en vez de armarla en el script. (3) Se descarta el flag `--home-only` (YAGNI: el orden del RPC ya pone destacados primero; usar `--limit` pequeño basta).

**Notas de entorno (válidas para todas las tareas):**
- Repo CRLF: **no** usar `prettier --write` (ensucia el diff). Verificar con `npm run lint` y `npm run typecheck` (lo que corre CI).
- Migraciones: aplicar vía Management API. Helper bash usado en este repo (PAT en `.env.local`):
  ```bash
  cd "C:/Users/Hector/Documents/AI webapps/comparador-portatiles"
  PAT=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2- | tr -d '\r"')
  python -c "import json,sys; open('.q.json','w').write(json.dumps({'query': open(sys.argv[1]).read()}))" db/migrations/00NN_x.sql
  curl -s -X POST "https://api.supabase.com/v1/projects/uhnbfyjapxbmifyeacly/database/query" \
    -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" --data-binary @.q.json; echo; rm -f .q.json
  ```
- Tras cada migración que cambie el esquema: `npm run db:types` (con `SUPABASE_ACCESS_TOKEN` del `.env.local`) para regenerar `lib/supabase/database.types.ts`. Nunca a mano.
- Trabajar en la rama `feat/affiliate-link-health` (ya creada).

---

## File Structure

- **Create** `db/migrations/0041_affiliate_link_health.sql` — columnas de salud + índice + RPC de selección `affiliate_links_to_check`.
- **Create** `lib/link-health.ts` — clasificador puro `classifyResponse(httpStatus, title) → LinkHealth`.
- **Create** `lib/link-health.test.ts` — tests Vitest del clasificador.
- **Create** `scripts/check-links.ts` — checker Playwright (lee candidatos, prueba, escribe salud).
- **Create** `db/migrations/0042_home_exclude_dead_links.sql` — redefine `home_featured` y `home_novedades` excluyendo productos sin enlace vivo.
- **Modify** `package.json` — script `"check:links"`.
- **Modify** `app/portatiles/[slug]/page.tsx` (query de `affiliate_links`, ~líneas 145-150) — añadir `.is('unavailable_at', null)`.
- **Modify** `lib/supabase/database.types.ts` — regenerado (no a mano) en Tareas 1 y 5.

---

## Task 1: Migración 0041 — columnas de salud + RPC de selección

**Files:**
- Create: `db/migrations/0041_affiliate_link_health.sql`
- Modify: `lib/supabase/database.types.ts` (regenerado)

- [ ] **Step 1: Escribir la migración**

Crear `db/migrations/0041_affiliate_link_health.sql` con exactamente:

```sql
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
```

- [ ] **Step 2: Aplicar la migración** (helper de la cabecera, fichero `db/migrations/0041_affiliate_link_health.sql`)

Esperado: `[]` (respuesta vacía sin error). DDL aplicada.

- [ ] **Step 3: Verificar columnas e índice**

```bash
PAT=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2- | tr -d '\r"')
python -c "import json; open('.q.json','w').write(json.dumps({'query':\"select column_name from information_schema.columns where table_name='affiliate_links' and column_name in ('unavailable_at','checked_at','last_status') order by 1;\"}))"
curl -s -X POST "https://api.supabase.com/v1/projects/uhnbfyjapxbmifyeacly/database/query" -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" --data-binary @.q.json; echo; rm -f .q.json
```
Esperado: las 3 columnas listadas (`checked_at`, `last_status`, `unavailable_at`).

- [ ] **Step 4: Regenerar tipos**

Run: `npm run db:types` (asegurar `SUPABASE_ACCESS_TOKEN` exportado del `.env.local`)
Esperado: `lib/supabase/database.types.ts` ahora incluye `unavailable_at`, `checked_at`, `last_status` en `affiliate_links` (Row/Insert/Update) y la función `affiliate_links_to_check` en `Functions`.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Esperado: PASS (0 errores).

- [ ] **Step 6: Commit**

```bash
git add db/migrations/0041_affiliate_link_health.sql lib/supabase/database.types.ts
git commit -m "feat(db): salud de enlaces de afiliado (columnas + RPC de selección)"
```

---

## Task 2: Clasificador puro `lib/link-health.ts` (TDD)

**Files:**
- Create: `lib/link-health.ts`
- Test: `lib/link-health.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/link-health.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { classifyResponse } from './link-health';

describe('classifyResponse', () => {
  it('410 Gone → dead', () => {
    expect(classifyResponse(410, 'Producto')).toBe('dead');
  });

  it('404 → dead', () => {
    expect(classifyResponse(404, 'Producto')).toBe('dead');
  });

  it('200 con título normal → alive', () => {
    expect(classifyResponse(200, 'Portátil Acer Nitro V — PcComponentes')).toBe('alive');
  });

  it('200 pero título "página no encontrada" (soft-404) → dead', () => {
    expect(classifyResponse(200, 'Página no encontrada')).toBe('dead');
  });

  it('200 con reto de Cloudflare sin resolver → inconclusive', () => {
    expect(classifyResponse(200, 'Just a moment...')).toBe('inconclusive');
    expect(classifyResponse(200, 'Un momento…')).toBe('inconclusive');
  });

  it('403 (bloqueo) → inconclusive', () => {
    expect(classifyResponse(403, '')).toBe('inconclusive');
  });

  it('0 (timeout/sin respuesta) → inconclusive', () => {
    expect(classifyResponse(0, '')).toBe('inconclusive');
  });

  it('500 → inconclusive', () => {
    expect(classifyResponse(500, 'Error')).toBe('inconclusive');
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/link-health.test.ts`
Esperado: FAIL — no se puede resolver el módulo `./link-health` / `classifyResponse is not a function`.

- [ ] **Step 3: Implementar el clasificador**

Crear `lib/link-health.ts`:

```ts
export type LinkHealth = 'dead' | 'alive' | 'inconclusive';

// Reto de Cloudflare aún sin resolver (mismo vocabulario que scripts/enrich-specs.ts).
const CHALLENGE_RE = /un momento|just a moment|verifying you are human|attention required/i;
// Soft-404: PcComponentes a veces sirve 200 con este título cuando el producto no existe.
const NOT_FOUND_RE = /p[áa]gina no encontrada/i;

/**
 * Traduce la respuesta de una URL de afiliado a salud del enlace.
 * - 410/404, o 200 con título de "página no encontrada" → 'dead'
 * - reto de Cloudflare sin resolver → 'inconclusive' (no decidir)
 * - 200 con título normal → 'alive'
 * - cualquier otro código (0/timeout, 403 bloqueo, 5xx) → 'inconclusive'
 *
 * El orden importa: el soft-404 (200 + título) se decide antes que el 200 vivo,
 * y el reto se separa del 200 vivo para no marcar vivo un interstitial.
 */
export function classifyResponse(httpStatus: number, title: string): LinkHealth {
  if (httpStatus === 410 || httpStatus === 404) return 'dead';
  if (NOT_FOUND_RE.test(title)) return 'dead';
  if (CHALLENGE_RE.test(title)) return 'inconclusive';
  if (httpStatus === 200) return 'alive';
  return 'inconclusive';
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run lib/link-health.test.ts`
Esperado: PASS (8 tests verdes).

- [ ] **Step 5: Suite completa + typecheck**

Run: `npm test` y `npm run typecheck`
Esperado: toda la suite verde; typecheck PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/link-health.ts lib/link-health.test.ts
git commit -m "feat: clasificador puro de salud de enlaces (classifyResponse)"
```

---

## Task 3: Checker Playwright `scripts/check-links.ts`

**Files:**
- Create: `scripts/check-links.ts`
- Modify: `package.json` (añadir script `check:links`)

> No tiene test automatizado (I/O contra sitio real + Playwright); la lógica con ramas vive en `lib/link-health.ts` (Tarea 2). Se verifica con `--dry-run` (Step 4) y typecheck.

- [ ] **Step 1: Escribir el checker**

Crear `scripts/check-links.ts`:

```ts
/**
 * Comprobador de salud de los enlaces de afiliado de PcComponentes (vía Playwright).
 *
 * Por qué Playwright (y no fetch): la ficha está tras Cloudflare (intermitente) y, sobre
 * todo, PcComponentes hace rate-limit AGRESIVO a barridos desde una sola IP (curl en lote
 * devuelve 000 al 100%). Un Chromium real, secuencial y espaciado, con contexto fresco por
 * URL, es lo único fiable — mismo patrón que scripts/enrich-specs.ts. CORRER EN LOCAL, no en
 * GitHub Actions (IP datacenter aún más bloqueada).
 *
 * Escribe affiliate_links.unavailable_at/checked_at/last_status. NO toca url/active.
 *   - 410/404 (o soft-404) → unavailable_at = now()  (sale de la home; ficha degrada)
 *   - 200                   → unavailable_at = null   (revive si volvió)
 *   - reto/timeout/403/5xx  → solo checked_at+last_status (no decide; evita falsos muertos)
 *
 * Uso:
 *   npm run check:links -- --limit 20 --dry-run   # prueba sin escribir
 *   npm run check:links -- --limit 150            # una pasada (destacados/nunca-verif. primero)
 *
 * Env (.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { chromium, type Browser, type Page } from 'playwright';

import { classifyResponse } from '@/lib/link-health';
import type { Database } from '@/lib/supabase/database.types';

loadEnv({ path: '.env.local' });

const { values: args } = parseArgs({
  options: {
    limit: { type: 'string', default: '150' },
    'dry-run': { type: 'boolean', default: false },
    delay: { type: 'string', default: '4000' }, // ms entre URLs (rate-limit de PcComponentes)
  },
});
const LIMIT = Number(args.limit);
const DRY_RUN = args['dry-run'];
const DELAY = Number(args.delay);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
}
const supabase = createClient<Database>(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const CHALLENGE_RE = /un momento|just a moment|verifying you are human|attention required/i;

async function probe(page: Page, url: string): Promise<{ status: number; title: string }> {
  let status = 0;
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    status = resp?.status() ?? 0;
  } catch {
    return { status: 0, title: '' };
  }
  // Si hay reto de Cloudflare, dale unos segundos para autorresolverse antes de leer el título.
  await page
    .waitForFunction(() => !/un momento|just a moment|verifying you are human|attention required/i.test(document.title || ''), {
      timeout: 12000,
    })
    .catch(() => {});
  const title = await page.title().catch(() => '');
  return { status, title };
}

async function main() {
  const { data: targets, error } = await supabase.rpc('affiliate_links_to_check', { p_limit: LIMIT });
  if (error) throw new Error(`RPC affiliate_links_to_check: ${error.message}`);
  const links = targets ?? [];
  console.log(`Comprobando ${links.length} enlaces (limit=${LIMIT}, dry-run=${DRY_RUN})\n`);

  let browser: Browser = await chromium.launch({ headless: true });
  let dead = 0;
  let alive = 0;
  let inconclusive = 0;

  for (const [i, link] of links.entries()) {
    // Reciclar el navegador cada 50 para soltar memoria/estado (igual que enrich-specs).
    if (i > 0 && i % 50 === 0) {
      await browser.close();
      browser = await chromium.launch({ headless: true });
    }
    const ctx = await browser.newContext({ locale: 'es-ES', userAgent: UA });
    const page = await ctx.newPage();
    const { status, title } = await probe(page, link.url);
    await ctx.close();

    const health = classifyResponse(status, title);
    const now = new Date().toISOString();
    let mark = '?';
    if (health === 'dead') {
      mark = '✗';
      dead++;
      if (!DRY_RUN) {
        await supabase
          .from('affiliate_links')
          .update({ unavailable_at: now, checked_at: now, last_status: status })
          .eq('id', link.id);
      }
    } else if (health === 'alive') {
      mark = '✓';
      alive++;
      if (!DRY_RUN) {
        await supabase
          .from('affiliate_links')
          .update({ unavailable_at: null, checked_at: now, last_status: 200 })
          .eq('id', link.id);
      }
    } else {
      inconclusive++;
      if (!DRY_RUN) {
        await supabase
          .from('affiliate_links')
          .update({ checked_at: now, last_status: status })
          .eq('id', link.id);
      }
    }

    console.log(`${mark} [${status || '---'}] ${link.url}`);
    if (i < links.length - 1) await sleep(DELAY);
  }

  await browser.close();
  console.log(`\nResumen: ${alive} vivos · ${dead} muertos · ${inconclusive} inconclusos`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Añadir el script npm**

En `package.json`, dentro de `"scripts"`, tras la línea `"enrich:elcorteingles": ...`, añadir (cuidando la coma del elemento anterior):

```json
    "check:links": "tsx scripts/check-links.ts"
```

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck` y `npm run lint`
Esperado: ambos PASS (0 errores). En particular `affiliate_links_to_check` y los `update` con las columnas nuevas deben tipar (dependen de la Tarea 1).

- [ ] **Step 4: Smoke test en seco contra el sitio real (manual)**

Run: `npm run check:links -- --limit 6 --dry-run`
Esperado: imprime ~6 líneas con código HTTP y `✓/✗/?`, y un resumen. Debe haber al menos algún `✓ [200]`. (Si todo sale `? [---]` la IP está rate-limited; esperar unos minutos y reintentar con `--limit 3`.) No escribe en BD.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-links.ts package.json
git commit -m "feat: checker Playwright de enlaces de afiliado (scripts/check-links.ts)"
```

---

## Task 4: Ficha — no mostrar enlaces muertos

**Files:**
- Modify: `app/portatiles/[slug]/page.tsx` (query de `affiliate_links`, ~líneas 145-150)

- [ ] **Step 1: Filtrar `unavailable_at is null` en la query de enlaces**

En `app/portatiles/[slug]/page.tsx`, localizar la query de `affiliate_links` (la que selecciona `'id, retailer_id, url'`) y añadir `.is('unavailable_at', null)` tras `.eq('active', true)`:

```ts
      supabase
        .from('affiliate_links')
        .select('id, retailer_id, url')
        .eq('laptop_id', laptop.id)
        .eq('active', true)
        .is('unavailable_at', null)
        .returns<AffiliateLink[]>(),
```

(No tocar la query de `retailers` de arriba, que también usa `.eq('active', true)` pero es otra tabla.)

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck` y `npm run lint`
Esperado: ambos PASS. La rama "Sin enlace afiliado" (ya existente, ~línea 367-369) cubrirá los productos cuyo enlace quede filtrado: la ficha sigue mostrando precio e histórico, sin botón "Ver oferta".

- [ ] **Step 3: Build (la ficha usa cliente admin en build; valida SSR)**

Run: `npm run build`
Esperado: build OK (la ruta `/portatiles/[slug]` compila sin errores).

- [ ] **Step 4: Commit**

```bash
git add "app/portatiles/[slug]/page.tsx"
git commit -m "feat: la ficha oculta enlaces de afiliado muertos (degrada a sin oferta)"
```

---

## Task 5: Migración 0042 — la home excluye productos sin enlace vivo

**Files:**
- Create: `db/migrations/0042_home_exclude_dead_links.sql`
- Modify: `lib/supabase/database.types.ts` (regenerado — sin cambios de firma, pero re-sincroniza)

- [ ] **Step 1: Escribir la migración** (re-emite ambos RPCs con el filtro de enlace vivo)

Crear `db/migrations/0042_home_exclude_dead_links.sql`:

```sql
-- 0042_home_exclude_dead_links.sql
-- La home (Destacados/Novedades) excluye productos sin un enlace de afiliado VIVO
-- (active y unavailable_at is null). Con un solo retailer, enlace muerto = sin vía de
-- compra → no debe aparecer en los feeds. Catálogo/búsqueda no cambian (la ficha degrada).
-- Re-emite las definiciones completas de 0038/0039 añadiendo el filtro `alive_link`.

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
    where l.featured_rank is not null
      and l.discontinued_at is null
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

create or replace function public.home_novedades(p_limit int default 12)
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
  with per_brand as (
    select distinct on (l.brand)
      l.id, l.slug, l.brand, l.model, l.image_url, l.created_at
    from public.laptops l
    where l.discontinued_at is null
      and l.image_url is not null
      and l.refurbished = false
      and l.model !~* '(servicio|suscrip|garant|licencia|seguro|microsoft 365)'
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
    select laptop_id, min(price_eur) as current_price
    from latest group by laptop_id
  )
  select
    n.id, n.slug, n.brand, n.model, n.image_url,
    c.current_price as current_price_eur,
    s.ram_gb, s.cpu, s.screen_inches
  from nuevos n
  join cur c on c.laptop_id = n.id
  left join public.specs s on s.laptop_id = n.id
  order by n.created_at desc
  limit p_limit;
$$;

grant execute on function public.home_novedades(int) to anon, authenticated;
```

- [ ] **Step 2: Aplicar la migración** (helper de la cabecera, fichero `db/migrations/0042_home_exclude_dead_links.sql`)

Esperado: `[]` sin error.

- [ ] **Step 3: Verificación funcional del filtro (marcar muerto → comprobar exclusión → restaurar)**

```bash
PAT=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2- | tr -d '\r"')
runq(){ python -c "import json,sys;open('.q.json','w').write(json.dumps({'query':sys.argv[1]}))" "$1"; curl -s -X POST "https://api.supabase.com/v1/projects/uhnbfyjapxbmifyeacly/database/query" -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" --data-binary @.q.json; echo; }
# (a) un destacado y su nº de antes
runq "select id, slug from public.home_featured(8) limit 1;"
# (b) marcar muerto su enlace (sustituir <ID> por el id de (a))
runq "update public.affiliate_links set unavailable_at = now() where laptop_id = '<ID>' and active;"
# (c) ya NO debe aparecer
runq "select count(*) from public.home_featured(8) where id = '<ID>';"   -- esperado: 0
# (d) restaurar
runq "update public.affiliate_links set unavailable_at = null where laptop_id = '<ID>';"
runq "select count(*) from public.home_featured(8) where id = '<ID>';"   -- esperado: 1
rm -f .q.json
```
Esperado: (c) → `0`, (d) final → `1`.

- [ ] **Step 4: Regenerar tipos (re-sincroniza; las firmas no cambian)**

Run: `npm run db:types`
Esperado: sin cambios de firma de `home_featured`/`home_novedades`; el diff puede quedar vacío. `npm run typecheck` PASS.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/0042_home_exclude_dead_links.sql lib/supabase/database.types.ts
git commit -m "feat(db): la home excluye productos sin enlace de afiliado vivo"
```

---

## Task 6: Documentación (vault + bitácora)

**Files:**
- Create/Modify (vault): `C:\Users\Hector\OneDrive\Aplicaciones\remotely-save\Hc\Vault Claude\comparador-portatiles\37-salud-enlaces-afiliado.md`
- Modify (vault): `…\05-bitacora.md` (entrada nueva), `…\00-indice.md` ("Estado actual")

> El vault puede revertirse por Remotely Save; re-leer tras editar.

- [ ] **Step 1: Nota técnica de la feature**

Crear `37-salud-enlaces-afiliado.md` resumiendo: problema (slugs caducados → 410; Algolia va por delante; scraper reafirma active), restricción (HTTP obligatorio, rate-limit agresivo → Playwright manual), solución (columnas `unavailable_at/checked_at/last_status`, RPC `affiliate_links_to_check`, checker `scripts/check-links.ts`, ficha filtra, home excluye), y cómo correrlo (`npm run check:links -- --limit 150`). Enlazar `[[36-home-destacados]]` y `[[enrich-specs-ficha-cloudflare]]`.

- [ ] **Step 2: Entrada en la bitácora** (fecha 2026-06-25) y actualizar "Estado actual" del índice.

- [ ] **Step 3: Commit** (solo si el vault está en git; si no, omitir — el vault se sincroniza por Remotely Save)

```bash
# (el vault está fuera del repo; este paso no toca el repo de código)
```

---

## Verificación final (tras todas las tareas)

- [ ] `npm run lint` — PASS
- [ ] `npm run typecheck` — PASS
- [ ] `npm test` — PASS (incluye `lib/link-health.test.ts`)
- [ ] `npm run build` — PASS
- [ ] `npm run e2e` — los tests de home siguen verdes (cards visibles)
- [ ] Pasada real del checker: `npm run check:links -- --limit 150` (en local; reintentar con `--limit` pequeño si la IP está limitada). Confirmar en BD: `select count(*) from affiliate_links where unavailable_at is not null;` > 0 y que el MacBook Neo "Tahoe 512GB" queda marcado muerto.
