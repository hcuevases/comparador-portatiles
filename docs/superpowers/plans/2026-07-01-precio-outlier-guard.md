# Guard de precio-alto-erróneo (ingesta + limpieza) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar de raíz el precio-alto-erróneo (ej. 2216 € sostenido en un portátil de ~950 €): un guard en la ingesta que descarta el outlier alto, una limpieza one-shot del histórico ya contaminado, y relajar el techo de Chollos a 50 %.

**Architecture:** Función pura `isHighOutlier` (`lib/price-guard.ts`) que compara un precio nuevo con la mediana reciente del portátil; se integra en `insertPriceHistory` de `scrape-catalog.ts` (fail-open). Limpieza histórica como migración SQL one-shot (`precio reciente = verdad`, con guarda de estabilidad y dry-run manual). Techo de Chollos a 50 % con una línea en `deals-section.tsx`.

**Tech Stack:** TypeScript, Vitest (unit), Supabase Postgres (RPC/Management API), Next.js 16. Repo CRLF → **no** `prettier --write`; verificar con `npm run lint` + `npm run typecheck` + `npm test` + `npm run e2e`.

**Spec:** `docs/superpowers/specs/2026-07-01-precio-outlier-guard-design.md`

---

## File structure

- **Create** `lib/price-guard.ts` — `median()`, `isHighOutlier()`, constantes. Función pura.
- **Create** `lib/price-guard.test.ts` — tests Vitest.
- **Modify** `scripts/scrape-catalog.ts` — `insertPriceHistory` aplica el guard (fail-open) + import.
- **Create** `db/migrations/0045_clean_outlier_prices.sql` — limpieza one-shot del histórico.
- **Modify** `components/deals-section.tsx` — pasar `p_max_drop_pct: 50` a `home_deals`.

Comandos SQL (Management API, patrón del repo):
```bash
PAT=$(grep -E '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2- | tr -d '"'\''\r')
API="https://api.supabase.com/v1/projects/uhnbfyjapxbmifyeacly/database/query"
```

---

### Task 1: `lib/price-guard.ts` (función pura + tests, TDD)

**Files:**
- Create: `lib/price-guard.ts`
- Create: `lib/price-guard.test.ts`

- [ ] **Step 1: Escribir el test que falla** — crear `lib/price-guard.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { median, isHighOutlier, HIGH_OUTLIER_FACTOR, MIN_HISTORY_FOR_GUARD } from './price-guard';

describe('median', () => {
  it('impar: el central', () => {
    expect(median([1000, 900, 950])).toBe(950);
  });
  it('par: promedia los dos centrales', () => {
    expect(median([900, 1000, 950, 970])).toBe(960); // (950+970)/2
  });
  it('no muta el array de entrada', () => {
    const arr = [3, 1, 2];
    median(arr);
    expect(arr).toEqual([3, 1, 2]);
  });
});

describe('isHighOutlier', () => {
  it('marca un precio muy por encima de la mediana reciente', () => {
    expect(isHighOutlier(2216, [900, 950, 1000, 950])).toBe(true); // 2216 > 950*1.8=1710
  });
  it('NO marca una bajada real (nunca lado bajo)', () => {
    expect(isHighOutlier(700, [950, 1000, 980])).toBe(false);
  });
  it('NO marca un precio normal dentro de banda', () => {
    expect(isHighOutlier(1000, [900, 950, 1000])).toBe(false); // 1000 < 950*1.8
  });
  it('arranque en frío: menos de MIN_HISTORY_FOR_GUARD precios → acepta', () => {
    expect(isHighOutlier(9000, [])).toBe(false);
    expect(isHighOutlier(9000, [1000, 1000])).toBe(false); // solo 2 < 3
  });
  it('robusto a un pico previo en el histórico: la mediana no se disparata', () => {
    // Un único 2216 entre precios normales no arrastra la mediana → el siguiente 1000 es normal.
    expect(isHighOutlier(1000, [950, 2216, 1000, 980, 960])).toBe(false); // mediana ≈ 980
  });
  it('respeta el factor por defecto en el borde', () => {
    expect(isHighOutlier(1800, [1000, 1000, 1000])).toBe(false); // 1800 = 1000*1.8, no es ">"
    expect(isHighOutlier(1801, [1000, 1000, 1000])).toBe(true);
  });
  it('acepta un factor explícito', () => {
    expect(isHighOutlier(1600, [1000, 1000, 1000], 1.5)).toBe(true); // 1600 > 1500
    expect(isHighOutlier(1600, [1000, 1000, 1000], 2.0)).toBe(false); // 1600 < 2000
  });
  it('las constantes tienen los valores esperados', () => {
    expect(HIGH_OUTLIER_FACTOR).toBe(1.8);
    expect(MIN_HISTORY_FOR_GUARD).toBe(3);
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `npm test -- lib/price-guard.test.ts`
Expected: FAIL (no existe `./price-guard`).

- [ ] **Step 3: Implementar `lib/price-guard.ts`:**

```ts
// Guard anti precio-alto-erróneo: un precio nuevo que se dispara sobre la mediana reciente del
// portátil es basura (variante equivocada / MSRP sin-stock) y se descarta en la ingesta. Solo
// lado alto: las bajadas son rebajas reales y nunca se rechazan. Ver el spec y validar-precios.

export const HIGH_OUTLIER_FACTOR = 1.8;
export const MIN_HISTORY_FOR_GUARD = 3;

// Mediana de un array no vacío. Copia antes de ordenar (no muta la entrada); en longitud par
// promedia los dos valores centrales.
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// true si `newPrice` es un outlier ALTO respecto al histórico reciente. Con menos de
// MIN_HISTORY_FOR_GUARD precios recientes devuelve false (arranque en frío: no hay referencia).
export function isHighOutlier(
  newPrice: number,
  recentPrices: number[],
  factor: number = HIGH_OUTLIER_FACTOR,
): boolean {
  if (recentPrices.length < MIN_HISTORY_FOR_GUARD) return false;
  return newPrice > median(recentPrices) * factor;
}
```

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run: `npm test -- lib/price-guard.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Lint + typecheck**

Run: `npm run lint; npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/price-guard.ts lib/price-guard.test.ts
git commit -m "feat(price): isHighOutlier — guard anti precio-alto-erróneo (TDD)"
```

---

### Task 2: Integrar el guard en la ingesta

**Files:**
- Modify: `scripts/scrape-catalog.ts`

- [ ] **Step 1: Añadir el import.** En `scripts/scrape-catalog.ts`, junto al import de `@/lib/price`:

Reemplazar:
```ts
import { sanePrice } from '@/lib/price';
```
por:
```ts
import { sanePrice } from '@/lib/price';
import { isHighOutlier, median } from '@/lib/price-guard';
```

- [ ] **Step 2: Aplicar el guard en `insertPriceHistory`.** Reemplazar la función entera:

```ts
async function insertPriceHistory(
  laptopId: string,
  retailerId: string,
  priceEur: number,
): Promise<void> {
  const pricePayload: TablesInsert<'prices_history'> = {
    laptop_id: laptopId,
    retailer_id: retailerId,
    price_eur: priceEur,
    in_stock: true,
  };
  await supabase.from('prices_history').insert([pricePayload]);
}
```
por:
```ts
async function insertPriceHistory(
  laptopId: string,
  retailerId: string,
  priceEur: number,
): Promise<void> {
  // Guard anti precio-alto-erróneo: si el precio se dispara sobre la mediana reciente (30d) del
  // (portátil, retailer), se descarta (no se inserta). Solo lado alto; ver lib/price-guard.
  // Fail-open: si la lectura del histórico falla, se inserta igualmente (un guard que rompe el
  // cron es peor que uno que deja pasar un punto puntual).
  try {
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const { data, error } = await supabase
      .from('prices_history')
      .select('price_eur')
      .eq('laptop_id', laptopId)
      .eq('retailer_id', retailerId)
      .gte('observed_at', since);
    if (!error && data) {
      const recent = data.map((r) => Number(r.price_eur));
      if (isHighOutlier(priceEur, recent)) {
        console.warn(
          `  ⚠ precio descartado ${priceEur}€ (mediana reciente ${median(recent)}€) — laptop ${laptopId}`,
        );
        return;
      }
    }
  } catch (e) {
    console.warn(`  ⚠ guard de precio no pudo leer histórico (${laptopId}); se inserta igualmente:`, e);
  }

  const pricePayload: TablesInsert<'prices_history'> = {
    laptop_id: laptopId,
    retailer_id: retailerId,
    price_eur: priceEur,
    in_stock: true,
  };
  await supabase.from('prices_history').insert([pricePayload]);
}
```

- [ ] **Step 3: Lint + typecheck**

Run: `npm run lint; npm run typecheck`
Expected: PASS. (`median` se usa en el log; `isHighOutlier` en la condición — sin imports sin usar.)

- [ ] **Step 4: Commit**

```bash
git add scripts/scrape-catalog.ts
git commit -m "feat(scraper): guard de precio-alto-erróneo en la ingesta (fail-open)"
```

---

### Task 3: Limpieza histórica (migración one-shot, con dry-run manual)

**Files:**
- Create: `db/migrations/0045_clean_outlier_prices.sql`

> **DESTRUCTIVO en producción.** El DELETE borra filas de `prices_history`. NO ejecutar el DELETE
> sin antes correr el dry-run (Step 2) y revisar la muestra (Step 3). Si la muestra contiene precios
> que parecen reales (no basura tipo 2216 € vs 950 €), PARAR y reportar — no borrar.

- [ ] **Step 1: Crear la migración** `db/migrations/0045_clean_outlier_prices.sql`:

```sql
-- 0045_clean_outlier_prices.sql
-- Limpieza one-shot del precio-alto-erróneo del histórico (ver spec / lib/price-guard).
-- Por (portátil, retailer): referencia = mediana de los últimos 14 días (>=3 puntos); SOLO si los
-- precios recientes son estables (max/min < 1.8, para no tocar rebajas/subidas reales recientes);
-- se borran los puntos MÁS VIEJOS que 14 días con price_eur > referencia * 1.8.
-- Idempotente (re-ejecutar no borra de más). Consistente con 0037_clean_sentinel_prices (#87).

with recent as (
  select
    laptop_id,
    retailer_id,
    percentile_cont(0.5) within group (order by price_eur) as ref_median,
    max(price_eur) as rmax,
    min(price_eur) as rmin,
    count(*) as n
  from public.prices_history
  where observed_at >= now() - interval '14 days'
  group by laptop_id, retailer_id
  having count(*) >= 3
),
targets as (
  -- recientes estables: descarta portátiles en rebaja/subida real reciente.
  select laptop_id, retailer_id, ref_median
  from recent
  where rmax / nullif(rmin, 0) < 1.8
)
delete from public.prices_history ph
using targets t
where ph.laptop_id = t.laptop_id
  and ph.retailer_id = t.retailer_id
  and ph.observed_at < now() - interval '14 days'
  and ph.price_eur > t.ref_median * 1.8;
```

- [ ] **Step 2: Dry-run** — contar y muestrear lo que se borraría (la MISMA lógica, en `select`):

```bash
PAT=$(grep -E '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2- | tr -d '"'\''\r')
curl -s -X POST "https://api.supabase.com/v1/projects/uhnbfyjapxbmifyeacly/database/query" \
  -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
  -d '{"query":"with recent as (select laptop_id, retailer_id, percentile_cont(0.5) within group (order by price_eur) as ref_median, max(price_eur) rmax, min(price_eur) rmin, count(*) n from public.prices_history where observed_at >= now() - interval '"'"'14 days'"'"' group by laptop_id, retailer_id having count(*) >= 3), targets as (select laptop_id, retailer_id, ref_median from recent where rmax/nullif(rmin,0) < 1.8) select count(*) as total_a_borrar from public.prices_history ph join targets t on ph.laptop_id=t.laptop_id and ph.retailer_id=t.retailer_id where ph.observed_at < now() - interval '"'"'14 days'"'"' and ph.price_eur > t.ref_median*1.8;"}'
```
Y una muestra de 15 filas (precio a borrar vs referencia real):
```bash
curl -s -X POST "https://api.supabase.com/v1/projects/uhnbfyjapxbmifyeacly/database/query" \
  -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
  -d '{"query":"with recent as (select laptop_id, retailer_id, percentile_cont(0.5) within group (order by price_eur) as ref_median, max(price_eur) rmax, min(price_eur) rmin, count(*) n from public.prices_history where observed_at >= now() - interval '"'"'14 days'"'"' group by laptop_id, retailer_id having count(*) >= 3), targets as (select laptop_id, retailer_id, ref_median from recent where rmax/nullif(rmin,0) < 1.8) select l.brand, l.model, ph.price_eur as a_borrar, round(t.ref_median,2) as ref_reciente, ph.observed_at::date from public.prices_history ph join targets t on ph.laptop_id=t.laptop_id and ph.retailer_id=t.retailer_id join public.laptops l on l.id=ph.laptop_id where ph.observed_at < now() - interval '"'"'14 days'"'"' and ph.price_eur > t.ref_median*1.8 order by ph.price_eur/t.ref_median desc limit 15;"}'
```
Expected: filas donde `a_borrar` es claramente desproporcionado frente a `ref_reciente` (ej. 2216 vs 950). Anotar `total_a_borrar` en el reporte.

- [ ] **Step 3: REVISIÓN (gate humano).** Mirar la muestra del Step 2. Cada `a_borrar` debe ser
  inverosímil para ese modelo frente a `ref_reciente`. Si alguna fila parece un **precio real**
  (ej. un portátil premium cuyo `a_borrar` 1900 vs `ref_reciente` 1000 podría ser real), **PARAR** y
  reportar `DONE_WITH_CONCERNS` con la muestra — que el controlador/usuario decida antes de borrar.
  Solo continuar al Step 4 si la muestra es claramente basura.

- [ ] **Step 4: Aplicar el DELETE** (solo tras aprobar el Step 3):

```bash
PAT=$(grep -E '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2- | tr -d '"'\''\r')
SQL=$(python -c 'import json,sys; print(json.dumps(open(sys.argv[1],encoding="utf-8").read()))' db/migrations/0045_clean_outlier_prices.sql)
curl -s -X POST "https://api.supabase.com/v1/projects/uhnbfyjapxbmifyeacly/database/query" \
  -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" -d "{\"query\": $SQL}"
```
Expected: `[]` (un DELETE no devuelve filas por la Management API).

- [ ] **Step 5: Verificar idempotencia** — re-ejecutar el `count` del Step 2.
Expected: `[{"total_a_borrar":0}]` (ya no queda basura que cumpla el criterio).

- [ ] **Step 6: Commit**

```bash
git add db/migrations/0045_clean_outlier_prices.sql
git commit -m "fix(db): limpia el precio-alto-erróneo del histórico (migr. 0045)"
```

---

### Task 4: Relajar el techo de Chollos a 50 % + gate completo

**Files:**
- Modify: `components/deals-section.tsx`

- [ ] **Step 1: Pasar `p_max_drop_pct: 50`.** En `components/deals-section.tsx`:

Reemplazar:
```tsx
  const { data, error } = await supabase.rpc('home_deals', { p_limit: 12 }).returns<DealRow[]>();
```
por:
```tsx
  // p_max_drop_pct=50: con el dato ya limpio de precio-alto-erróneo (guard + limpieza 0045), se
  // dejan pasar chollos reales más agresivos. Sigue siendo la red contra un precio erróneamente bajo.
  const { data, error } = await supabase
    .rpc('home_deals', { p_limit: 12, p_max_drop_pct: 50 })
    .returns<DealRow[]>();
```

- [ ] **Step 2: Suite completa (gate de CI)**

Run: `npm run lint; npm run typecheck; npm test; npm run e2e`
Expected: PASS en todo — `lib/price-guard.test.ts` incluido en Vitest; e2e (9) en verde (el techo a 50 % no cambia los tests tolerantes de Chollos).

- [ ] **Step 3: Commit**

```bash
git add components/deals-section.tsx
git commit -m "feat(chollos): relaja el techo de bajada a 50% (dato ya limpio)"
```

---

## Notas de implementación

- **CRLF**: no `prettier --write`. Verificar con lint + typecheck + vitest + e2e.
- **Task 3 es destructiva en producción**: dry-run + revisión humana ANTES del DELETE. No dejar el
  DELETE a un subagente autónomo sin ese gate.
- **Fail-open del guard**: prioridad a no tumbar el cron; un descarte perdido es tolerable.
- **Rama**: `feat/precio-outlier-guard` (ya creada desde `main`).
- **Al cerrar**: nota de vault `40-precio-outlier-guard.md` + bitácora + PR. Actualizar la memoria
  [[validar-precios-scrapeados]] (el techo del 30 % pasó a 50 %; el fix de raíz está hecho).
