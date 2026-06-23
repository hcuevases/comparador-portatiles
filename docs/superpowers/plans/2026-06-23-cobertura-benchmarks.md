# Mejora de cobertura de benchmarks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Subir la cobertura de benchmarks partiendo la clave genérica de Snapdragon X por modelo, añadiendo flags `--rekey`/`--retry-notfound` al enricher, y soportando filas manuales (`status='manual'`) para los componentes ausentes de nanoreview.

**Architecture:** Tres componentes sobre el subsistema existente: (A) normalizador `lib/benchmarks/normalize.ts`; (B) `scripts/enrich-benchmarks.ts` (dos flags); (C) seed SQL de manuales. El join LEFT de ficha/comparar por `specs.cpu_key`/`gpu_key` no se toca.

**Tech Stack:** TypeScript strict, tsx scripts, Playwright (scrape, local), Vitest, Supabase service-role + Management API para SQL. CI = `eslint` + `tsc` + `vitest run`. Repo CRLF (no `prettier --write`).

**Spec:** `docs/superpowers/specs/2026-06-23-cobertura-benchmarks-design.md`

---

### Task 1: Normalizador de Snapdragon por código de modelo

**Files:**
- Modify: `lib/benchmarks/normalize.ts` (rama Snapdragon en `extractCpuKey`)
- Test: `lib/benchmarks/normalize.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Añadir al final de `lib/benchmarks/normalize.test.ts` (dentro del `describe('extractCpuKey', …)` si existe, o como bloque nuevo; ajustar el import si hace falta — `extractCpuKey` ya se usa en ese archivo):

```ts
describe('extractCpuKey — Snapdragon X por modelo', () => {
  it('captura el código X1-26-100', () => {
    expect(extractCpuKey('OmniBook 5 16" Snapdragon X1-26-100 16GB 512GB SSD', null)).toBe(
      'qualcomm-snapdragon-x1-26-100',
    );
  });
  it('captura X1P (Plus) y X1E (Elite) con código', () => {
    expect(extractCpuKey('IdeaPad 5 Qualcomm Snapdragon X1P-42-100 16GB', null)).toBe(
      'qualcomm-snapdragon-x1p-42-100',
    );
    expect(extractCpuKey('ThinkPad T14s Snapdragon X1E-78-100 32GB', null)).toBe(
      'qualcomm-snapdragon-x1e-78-100',
    );
    expect(extractCpuKey('Latitude 7455 Snapdragon X1E-80-100 32 GB', null)).toBe(
      'qualcomm-snapdragon-x1e-80-100',
    );
  });
  it('sin código cae al fallback (bare / Elite / Plus)', () => {
    expect(extractCpuKey('OmniBook 5 NGAI 16" Snapdragon X 16GB 512GB SSD', null)).toBe(
      'qualcomm-snapdragon-x',
    );
    expect(extractCpuKey('Galaxy Book4 Edge Snapdragon X Elite 16GB', null)).toBe(
      'qualcomm-snapdragon-x-elite',
    );
  });
  it('no afecta a otras marcas (regresión)', () => {
    expect(extractCpuKey('Acer Aspire Intel Core i7-13620H 16GB', 'Intel Core i7')).toBe(
      'intel-core-i7-13620h',
    );
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npx vitest run lib/benchmarks/normalize.test.ts`
Expected: FAIL (las claves Snapdragon con código dan hoy `qualcomm-snapdragon-x`).

- [ ] **Step 3: Implementar**

En `lib/benchmarks/normalize.ts`, sustituir la rama Snapdragon actual:

```ts
  // Qualcomm Snapdragon X (Elite|Plus).
  m = name.match(/Snapdragon\s+X(?:\s+(Elite|Plus))?/i);
  if (m) return `qualcomm-snapdragon-x${m[1] ? `-${m[1].toLowerCase()}` : ''}`;
```

por:

```ts
  // Qualcomm Snapdragon X con código de modelo: "X1-26-100", "X1P-42-100",
  // "X1E-78-100". Distingue los tiers (X1 base / X1P Plus / X1E Elite), que comparten
  // el nombre "Snapdragon X" pero son chips distintos en nanoreview.
  m = name.match(/Snapdragon\s+(X1[EP]?)[-\s](\d{2})-(\d{3})/i);
  if (m) return `qualcomm-snapdragon-${m[1].toLowerCase()}-${m[2]}-${m[3]}`;
  // Sin código: solo "Snapdragon X" o "X Elite/Plus" en el nombre.
  m = name.match(/Snapdragon\s+X(?:\s+(Elite|Plus))?/i);
  if (m) return `qualcomm-snapdragon-x${m[1] ? `-${m[1].toLowerCase()}` : ''}`;
```

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `npx vitest run lib/benchmarks/normalize.test.ts`
Expected: PASS (todos, incluidos los pre-existentes).

- [ ] **Step 5: Lint + typecheck**

Run: `npm run lint; npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/benchmarks/normalize.ts lib/benchmarks/normalize.test.ts
git commit -m "feat(benchmarks): normaliza Snapdragon X por código de modelo (X1/X1P/X1E)"
```

---

### Task 2: Flag `--rekey` en el enricher

**Files:**
- Modify: `scripts/enrich-benchmarks.ts`

Contexto: `fillKeys()` solo rellena `cpu_key`/`gpu_key` que sean `null`. Para que el normalizador nuevo re-keye specs que ya tienen una clave vieja, hay que ponerla a `null` antes. `--rekey <clave>` hace ese reset filtrado.

- [ ] **Step 1: Añadir el flag y la constante**

En el `options` de `parseArgs` (junto a `limit`, `kind`, etc.) añadir:

```ts
    rekey: { type: 'string' }, // pone a null cpu_key/gpu_key = <clave> antes de fillKeys
    'retry-notfound': { type: 'boolean', default: false }, // (Task 3) re-scrapea notfound
```

Y junto a las otras constantes derivadas (`LIMIT`, `KIND`, …):

```ts
const REKEY = args.rekey;
const RETRY_NOTFOUND = args['retry-notfound']; // usado en Task 3
```

- [ ] **Step 2: Añadir la función `rekey`**

Añadir antes de `fillKeys` (o junto a él):

```ts
// Pone a null cpu_key/gpu_key iguales a `oldKey` para que fillKeys los recompute con el
// normalizador nuevo. Idempotente. Útil tras corregir el normalizador de un componente.
async function rekey(oldKey: string): Promise<void> {
  if (DRY_RUN) {
    console.log(`(dry) re-key: pondría a null cpu_key/gpu_key = "${oldKey}"`);
    return;
  }
  const c = await supabase.from('specs').update({ cpu_key: null }).eq('cpu_key', oldKey).select('laptop_id');
  const g = await supabase.from('specs').update({ gpu_key: null }).eq('gpu_key', oldKey).select('laptop_id');
  if (c.error) console.log(`   ✗ rekey cpu: ${c.error.message}`);
  if (g.error) console.log(`   ✗ rekey gpu: ${g.error.message}`);
  console.log(`re-key "${oldKey}": cpu ${c.data?.length ?? 0}, gpu ${g.data?.length ?? 0} fila(s) reseteadas.`);
}
```

- [ ] **Step 3: Llamarla al principio de `main`**

En `main()`, justo antes de `await fillKeys();`, añadir:

```ts
  if (REKEY) await rekey(REKEY);
```

- [ ] **Step 4: Lint + typecheck**

Run: `npm run lint; npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Verificación en dry-run (sin escribir)**

Run: `npm run enrich:benchmarks -- --rekey qualcomm-snapdragon-x --keys-only --dry-run`
Expected: imprime `(dry) re-key: pondría a null cpu_key/gpu_key = "qualcomm-snapdragon-x"` y luego el resumen de `fillKeys` (paso 1) en dry. No escribe.

- [ ] **Step 6: Commit**

```bash
git add scripts/enrich-benchmarks.ts
git commit -m "feat(benchmarks): flag --rekey (resetea una clave para re-keyear con el normalizador nuevo)"
```

---

### Task 3: Flag `--retry-notfound` en el enricher

**Files:**
- Modify: `scripts/enrich-benchmarks.ts`

Contexto: hoy `existingKeys(table)` devuelve un `Set<string>` con TODAS las `component_key` de la tabla (cualquier status) y `scrapeKind` excluye esas claves. Eso bloquea reintentar las `notfound`. Cambiamos la carga para distinguir `done` (`ok`/`manual`) de `notfound`, y con `--retry-notfound` reintentamos las `notfound` (respetando overrides, que ya se consultan). Las `manual` NUNCA se re-scrapean.

- [ ] **Step 1: Cambiar `existingKeys` por `loadExisting` (done vs notfound)**

Sustituir la función `existingKeys`:

```ts
async function existingKeys(table: 'cpu_benchmarks' | 'gpu_benchmarks'): Promise<Set<string>> {
  const out = new Set<string>();
  const { data, error } = await supabase.from(table).select('component_key').returns<{ component_key: string }[]>();
  if (error) throw new Error(error.message);
  for (const r of data ?? []) out.add(r.component_key);
  return out;
}
```

por:

```ts
type ExistingKeys = { done: Set<string>; notfound: Set<string> };

// `done` = status 'ok' | 'manual' (no re-scrapear nunca). `notfound` = reintentables
// con --retry-notfound. Las filas 'manual' caen en `done`, así que quedan protegidas.
async function loadExisting(table: 'cpu_benchmarks' | 'gpu_benchmarks'): Promise<ExistingKeys> {
  const { data, error } = await supabase
    .from(table)
    .select('component_key, status')
    .returns<{ component_key: string; status: string }[]>();
  if (error) throw new Error(error.message);
  const done = new Set<string>();
  const notfound = new Set<string>();
  for (const r of data ?? []) (r.status === 'notfound' ? notfound : done).add(r.component_key);
  return { done, notfound };
}
```

- [ ] **Step 2: Actualizar el cache de módulo `existingSets`**

Sustituir:

```ts
const existingSets: Record<'cpu_benchmarks' | 'gpu_benchmarks', Set<string>> = {
  cpu_benchmarks: new Set(),
  gpu_benchmarks: new Set(),
};
```

por:

```ts
const existingSets: Record<'cpu_benchmarks' | 'gpu_benchmarks', ExistingKeys> = {
  cpu_benchmarks: { done: new Set(), notfound: new Set() },
  gpu_benchmarks: { done: new Set(), notfound: new Set() },
};
```

- [ ] **Step 3: Actualizar las cargas en `main`**

Sustituir en `main()`:

```ts
  existingSets.cpu_benchmarks = await existingKeys('cpu_benchmarks');
  existingSets.gpu_benchmarks = await existingKeys('gpu_benchmarks');
```

por:

```ts
  existingSets.cpu_benchmarks = await loadExisting('cpu_benchmarks');
  existingSets.gpu_benchmarks = await loadExisting('gpu_benchmarks');
```

- [ ] **Step 4: Actualizar el filtro de `needed` en `scrapeKind`**

Sustituir en `scrapeKind`:

```ts
  const needed = [...(await pagedDistinct(col))].filter((k) => !existingSets[table].has(k)).slice(0, LIMIT);
```

por:

```ts
  // Excluir siempre las `done` (ok/manual); las `notfound` solo si NO se pide reintento.
  const ex = existingSets[table];
  const needed = [...(await pagedDistinct(col))]
    .filter((k) => !ex.done.has(k) && (RETRY_NOTFOUND || !ex.notfound.has(k)))
    .slice(0, LIMIT);
```

- [ ] **Step 5: Lint + typecheck**

Run: `npm run lint; npm run typecheck`
Expected: PASS (no quedan referencias a `existingKeys`; si el linter marca `existingKeys` sin usar, es que no se sustituyó — corregir).

- [ ] **Step 6: Verificación en dry-run**

Run: `npm run enrich:benchmarks -- --kind gpu --retry-notfound --dry-run --limit 3`
Expected: en `Paso 2 (gpu)` el número de componentes a scrapear INCLUYE alguna clave que antes estaba `notfound` (hay 7 GPU notfound). Sin el flag, ese número sería menor. No escribe (dry-run).

- [ ] **Step 7: Commit**

```bash
git add scripts/enrich-benchmarks.ts
git commit -m "feat(benchmarks): flag --retry-notfound (reintenta notfound; protege ok/manual)"
```

---

### Task 4: Seed SQL de benchmarks manuales (componentes ausentes)

**Files:**
- Create: `db/migrations/0034_manual_benchmarks.sql`

Contexto: Apple M-Pro/Max y similares no están en nanoreview. Se insertan filas `status='manual'` en `cpu_benchmarks` con números de fuente pública (Geekbench 6). El enricher las protege (Task 3: `manual` ∈ `done`). `cores`/`release_year` son conocidos; `geekbench_single`/`geekbench_multi` se toman de Geekbench.

- [ ] **Step 1: Obtener los números de Geekbench 6**

Para cada componente manual, leer las medias de Geekbench 6 (Mac Benchmarks):
Run (WebFetch): `https://browser.geekbench.com/mac-benchmarks` con prompt "Give the Geekbench 6 single-core and multi-core average scores for Apple M4 Pro, Apple M4 Max, and Apple M5 Max."
Anotar single/multi de cada uno. Si M5 Max no aparece aún (muy nuevo), omitir su fila (se deja `notfound`/sin dato hasta que haya fuente).

- [ ] **Step 2: Crear la migración**

Crear `db/migrations/0034_manual_benchmarks.sql` con esta estructura, sustituyendo `<single>`/`<multi>` por los valores del Step 1 (y omitiendo la fila de M5 Max si no hubo fuente):

```sql
-- 0034_manual_benchmarks.sql
-- Benchmarks MANUALES para componentes que NO están en nanoreview (Apple M-Pro/Max).
-- status='manual' → el enricher los respeta (no re-scrapea; --retry-notfound los excluye
-- por no ser 'notfound'). La ficha/comparar los leen por el mismo join LEFT que el resto.
-- Números: Geekbench 6 (browser.geekbench.com), medias a 2026-06-23. cores/release_year
-- de las specs de Apple. score se deja null (no hay nota 0-100 de nanoreview).

insert into public.cpu_benchmarks
  (component_key, name, status, geekbench_single, geekbench_multi, cores, release_year)
values
  ('apple-m4-pro', 'Apple M4 Pro', 'manual', <single>, <multi>, 14, 2024),
  ('apple-m4-max', 'Apple M4 Max', 'manual', <single>, <multi>, 16, 2024)
on conflict (component_key) do nothing;
```

- [ ] **Step 3: Aplicar la migración vía Management API**

Aplicar el SQL contra Supabase (PAT en `.env.local`, endpoint `…/database/query`, ver `lib/`/memoria de acceso SQL). Verificar después:
Run (Management API): `select component_key, status, geekbench_multi from public.cpu_benchmarks where status='manual';`
Expected: las filas insertadas aparecen con `status='manual'`.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/0034_manual_benchmarks.sql
git commit -m "feat(benchmarks): seed manual de Apple M4 Pro/Max (ausentes de nanoreview)"
```

---

### Task 5: Suite completa (gate de CI)

- [ ] **Step 1: lint + typecheck + tests**

Run: `npm run lint; npm run typecheck; npm test`
Expected: PASS — todos verdes (incluidos los nuevos tests del normalizador).

- [ ] **Step 2: Commit si quedara algo pendiente** (normalmente nada).

---

## Población de datos (ejecución, tras mergear los mecanismos)

Esto NO es código; se ejecuta en local (Playwright, IP residencial) tras tener Tasks 1–4.
Se documenta aquí para no perderlo:

1. **Snapdragon:** `npm run enrich:benchmarks -- --rekey qualcomm-snapdragon-x --keys-only`
   (re-keya los 51 con las claves nuevas), luego `npm run enrich:benchmarks -- --kind cpu --limit 20`
   (scrapea las claves X1/X1P/X1E nuevas). Revisar cuáles resuelven; los que den 404,
   verificar slug con `--dump <clave> --kind cpu` y añadir `benchmark_overrides`.
2. **Cola larga:** para las `notfound` de mayor cobertura, `--dump` para hallar el slug,
   insertar `benchmark_overrides (kind, source_key, nanoreview_slug)`, y correr
   `npm run enrich:benchmarks -- --kind cpu --retry-notfound --limit N`.
3. **Manuales:** ampliar `0034` (o un seed posterior) con más ausentes confirmados.

## Notas de implementación

- **CRLF**: no `prettier --write`. Verificar con lint + typecheck + vitest.
- **Convención de tests**: solo lógica pura en Vitest (el normalizador). El enricher es
  I/O Playwright (verificación manual / dry-run), como el resto del repo.
- **No tocar**: el join/UI de ficha/comparar, ni el modo de scrape existente más allá de
  los dos flags. `status='manual'` queda protegido por el filtro `done` de Task 3.
- **Rama**: `feat/cobertura-benchmarks`. Al cerrar: nota de vault (addendum en
  `27-benchmarks-nanoreview`) + bitácora.
