# Fix de raíz del precio-alto-erróneo (guard de ingesta + limpieza) — Design

**Fecha:** 2026-07-01
**Rama:** `feat/precio-outlier-guard` (desde `main`)

## Problema

El scraper de PcComponentes a veces devuelve un precio **alto pero dentro de rango** para un
portátil (ej. **2216,90 €** sostenido durante semanas en un equipo cuyo precio real es ~950 €:
variante equivocada o MSRP de "sin stock"). `sanePrice` (`lib/price.ts`, rango `[100, 9500]`) no lo
filtra porque es plausible en aislado. Al acumularse, ese valor **domina la ventana** de precios del
portátil y envenena la referencia de "Chollos" (`home_deals`), obligando al parche del techo del 30%.
Es una corrupción distinta a los centinelas que limpió #87 (`6.45`/`9999`/`10005`).

Ver [[validar-precios-scrapeados]] y la nota de vault 38-home-chollos.

## Objetivo

Eliminar el precio-alto-erróneo **de raíz**, en dos piezas:

1. **Guard de ingesta** (going forward): un precio nuevo que se dispara sobre la mediana reciente del
   portátil no se inserta en `prices_history`.
2. **Limpieza histórica** (one-shot): purgar los puntos alto-erróneos que ya están en el histórico.

Con ambas, el techo de Chollos deja de ser necesario como red del lado alto → se **relaja a 50 %**.

## Decisiones (acordadas con el usuario)

- Alcance: **guard + limpieza histórica** (fix completo).
- Precio sospechoso: **descartar** (no insertar / borrar), logueando cada descarte. Sin columna
  nueva (mínima superficie; precedente #87). 
- Umbral: **descartar si `precio > mediana_reciente × 1,8`**, **solo lado alto** (las bajadas nunca se
  rechazan, para no perder rebajas reales).
- Limpieza histórica: **precio reciente = verdad** (el replay cronológico no sirve — un tramo malo
  sostenido es "consistente consigo mismo" y no se detectaría). Con `--dry-run` + revisión manual
  antes de borrar, por el riesgo de sobre-borrado en rebajas reales profundas.
- Techo de Chollos: **relajar de 30 % a 50 %**.

## Arquitectura

### 1. Guard de ingesta

**`lib/price-guard.ts`** — función pura, sin dependencias de IO, testeable:

```ts
export const HIGH_OUTLIER_FACTOR = 1.8;
export const MIN_HISTORY_FOR_GUARD = 3;

// median de un array no vacío (copia y ordena; promedia los 2 centrales si es par).
export function median(values: number[]): number;

// true si newPrice es un outlier ALTO respecto al histórico reciente.
// - Con < MIN_HISTORY_FOR_GUARD precios recientes → false (arranque en frío: no hay con qué comparar).
// - true solo si newPrice > median(recentPrices) * factor. Nunca marca por el lado bajo.
export function isHighOutlier(
  newPrice: number,
  recentPrices: number[],
  factor?: number, // default HIGH_OUTLIER_FACTOR
): boolean;
```

**Integración en `scripts/scrape-catalog.ts`** (`insertPriceHistory`, la función que comparten el
modo completo y `--prices-only`): antes de insertar, leer los precios recientes de ese
`(laptop_id, retailer_id)` de los últimos 30 días y aplicar el guard.

```ts
async function insertPriceHistory(laptopId, retailerId, priceEur) {
  const { data } = await supabase
    .from('prices_history')
    .select('price_eur')
    .eq('laptop_id', laptopId)
    .eq('retailer_id', retailerId)
    .gte('observed_at', new Date(Date.now() - 30 * 864e5).toISOString());
  const recent = (data ?? []).map((r) => Number(r.price_eur));
  if (isHighOutlier(priceEur, recent)) {
    console.warn(`  ⚠ precio descartado ${priceEur}€ (mediana reciente ${median(recent)}€) — ${laptopId}`);
    return; // no se inserta
  }
  await supabase.from('prices_history').insert([{ laptop_id: laptopId, retailer_id: retailerId, price_eur: priceEur, in_stock: true }]);
}
```

Coste: una SELECT extra por punto de precio (asumible en el cron; ya hay varias queries por
portátil). Referencia por `(laptop, retailer)` — mayormente un solo retailer (PcComponentes).

### 2. Limpieza histórica — `db/migrations/0045_clean_outlier_prices.sql`

One-shot SQL (consistente con `0037_clean_sentinel_prices.sql` de #87). Por portátil:

- `recent` = mediana de `price_eur` de los **últimos 14 días** (con ≥3 puntos).
- **Estabilidad**: solo se actúa si los precios recientes son estables — `max(recent)/min(recent) < 1.8` —
  para no tocar portátiles en rebaja/subida real reciente.
- **Borrado**: se eliminan los puntos con `observed_at < now() - interval '14 days'` y
  `price_eur > recent_median * 1.8`.

Se entrega junto a una **consulta SELECT equivalente (dry-run)** en el mismo fichero (comentada) o en
el reporte del plan, que se ejecuta ANTES por Management API para revisar una muestra de lo que se
borraría. Solo tras validar la muestra (que son 2216€-tipo, no precios reales) se aplica el DELETE.

### 3. Techo de Chollos → 50 %

**`components/deals-section.tsx`**: la llamada `supabase.rpc('home_deals', { p_limit: 12 })` pasa a
`{ p_limit: 12, p_max_drop_pct: 50 }`. Un cambio de una línea, sin tocar la RPC (su default sigue 30
para otros usos; el consumo de la home usa 50). Sigue siendo la red contra un precio erróneamente
**bajo** (que el guard asimétrico no cubre).

## Flujo de datos

- Ingesta: `parse (sanePrice [100,9500])` → `insertPriceHistory` → **guard (isHighOutlier vs mediana
  30d)** → insert o descarte logueado.
- Limpieza: one-shot SQL, dry-run → revisión → DELETE.
- Chollos: `home_deals(p_max_drop_pct=50)` con el histórico ya limpio.

## Manejo de errores

- Guard en frío (<3 precios recientes) → acepta (no bloquea catálogo nuevo).
- Si la SELECT de precios recientes falla, el guard no debe tumbar la ingesta: en caso de error de
  lectura, se inserta igualmente (fail-open) y se loguea el fallo — un guard que rompe el cron es peor
  que un guard que ocasionalmente deja pasar un punto.
- La limpieza es idempotente (volver a correrla no borra de más una vez purgado).

## Testing

- **Vitest `lib/price-guard.test.ts`**:
  - `median` con longitud par/impar.
  - `isHighOutlier`: outlier alto (2216 vs [900,950,1000]) → true.
  - bajada real (700 vs [950,1000,980]) → false (nunca lado bajo).
  - arranque en frío (`[]` y `[1000,1000]`, <3) → false.
  - robustez: un pico previo en el histórico no dispara falsos positivos en el siguiente punto normal.
  - factor por defecto 1,8 (2199 vs mediana 1000 → true; 1700 vs 1000 → false; borde 1800 → false).
- Limpieza y guard-en-cron: sin unit test (SQL/IO); se validan con el dry-run + los logs del cron.
- Gate completo (lint · typecheck · vitest · e2e) en verde antes del PR. Repo CRLF → no
  `prettier --write`.

## Fuera de alcance

- Guard del lado **bajo** (precio erróneamente barato): no se aborda; lo cubre el techo de Chollos.
  Se puede hacer más adelante si aparece el caso.
- Un modelo de precio por specs (para validar plausibilidad absoluta): innecesario aquí.
- Multi-retailer: la referencia es por `(laptop, retailer)`; hoy es mayormente PcComponentes.
