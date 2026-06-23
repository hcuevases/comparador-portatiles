# Diseño: mejorar la cobertura de benchmarks

**Fecha:** 2026-06-23
**Estado:** aprobado (pendiente de revisión del spec por el usuario)

## Problema

57 componentes están marcados `status='notfound'` en las tablas de benchmarks (50 CPU,
7 GPU), así que esos portátiles no muestran rendimiento en ficha/comparar. El análisis
por cobertura (portátiles afectados por clave) revela tres grupos muy distintos:

1. **`qualcomm-snapdragon-x` — 51 portátiles.** Clave **genérica**: el normalizador
   colapsa todos los Snapdragon X a una sola clave. Los nombres reales SÍ llevan el
   modelo concreto (`Snapdragon X1-26-100`, `X1P-42-100`, `X1E-78-100`, `X1E-80-100`),
   pero el regex actual solo captura las palabras "Elite/Plus", que estos nombres casi
   no usan. Son ~4-5 chips distintos colapsados en uno. → **problema de normalizador**,
   no de override (un único slug sería incorrecto para muchos).
2. **Cola larga corregible** (≤11 c/u): chips que existen en nanoreview bajo un slug
   distinto al que produjo el normalizador (p.ej. Ryzen AI nuevos). → **override
   clave→slug**, pero hoy una fila `notfound` queda bloqueada (no se re-scrapea).
3. **Ausentes de nanoreview**: Apple M4 Pro (9), M5 Max (7), M4 Max (6), GPU
   workstation… No existen en nanoreview → ningún slug ayuda. → **valor manual**.

## Datos (2026-06-23, consultados vía Management API)

- CPU: 187 `ok`, 50 `notfound`. GPU: 22 `ok`, 7 `notfound`.
- Top notfound por cobertura: `qualcomm-snapdragon-x` (51), `amd-ryzen-ai-5-330` (11),
  `apple-m4-pro` (9), `apple-m5-max` (7), `apple-m4-max` (6), `intel-core-i5-6300u` (6),
  `amd-ryzen-3-7335u` (6)… resto ≤5.
- Nombres Snapdragon reales contienen: `X1-26-100` (mayoría), `X1P-42-100`,
  `X1E-78-100`, `X1E-80-100`, y algún "Snapdragon X" sin código.

## Decisiones

- **Un solo spec, tres componentes** sobre el subsistema existente (comparten el flujo
  re-key → re-scrape). Descartado: specs separados (se solaparían).
- **Manuales como filas `status='manual'`** en `cpu_benchmarks`/`gpu_benchmarks` (no
  tabla nueva, no cambio de UI; la ficha/comparar las leen por el mismo join). Vía seed
  SQL idempotente versionado.
- **Priorizar por cobertura.** El componente A (Snapdragon) es el gran valor (código +
  tests). La cola larga y los manuales son trabajo de datos de menor valor por
  componente; se persiguen por cobertura, no exhaustivamente.

## Arquitectura

Piezas tocadas: `lib/benchmarks/normalize.ts` (+test), `scripts/enrich-benchmarks.ts`,
un seed SQL nuevo. El join LEFT de ficha/comparar por `specs.cpu_key`/`gpu_key` **no se
toca**.

### Componente A — Normalizador de Snapdragon (código, testeable)

En `extractCpuKey` (`lib/benchmarks/normalize.ts`), sustituir la rama Snapdragon actual:

```ts
// actual:
m = name.match(/Snapdragon\s+X(?:\s+(Elite|Plus))?/i);
if (m) return `qualcomm-snapdragon-x${m[1] ? `-${m[1].toLowerCase()}` : ''}`;
```

por una que capture primero el **código de modelo** (`X1`, `X1P`, `X1E` + `NN-NNN`) y,
si no hay código, caiga al comportamiento anterior:

```ts
// Snapdragon X con código de modelo: "X1-26-100", "X1P-42-100", "X1E-78-100".
m = name.match(/Snapdragon\s+(X1[EP]?)[-\s](\d{2})-(\d{3})/i);
if (m) return `qualcomm-snapdragon-${m[1].toLowerCase()}-${m[2]}-${m[3]}`;
// Sin código: solo Elite/Plus o "Snapdragon X" a secas.
m = name.match(/Snapdragon\s+X(?:\s+(Elite|Plus))?/i);
if (m) return `qualcomm-snapdragon-x${m[1] ? `-${m[1].toLowerCase()}` : ''}`;
```

Resultado de claves: `qualcomm-snapdragon-x1-26-100`, `…-x1p-42-100`, `…-x1e-78-100`,
`…-x1e-80-100`, y `qualcomm-snapdragon-x` para el bare. El scraper resuelve el slug real
(candidatos + overrides).

### Componente B — Mecanismo en el enricher (código)

Dos flags nuevos en `scripts/enrich-benchmarks.ts`:

- **`--rekey <claveVieja>`**: antes de `fillKeys`, pone a `null` los `cpu_key` **y**
  `gpu_key` que sean igual a `<claveVieja>` (UPDATE filtrado); luego `fillKeys` (que ya
  solo rellena nulls) los recomputa con el normalizador nuevo. Idempotente y reusable.
  Para Snapdragon: `--rekey qualcomm-snapdragon-x`.
- **`--retry-notfound`**: en `scrapeKind`, el set `needed` deja de excluir las claves
  cuya fila sea `status='notfound'` (hoy las filtra `existingKeys`); se vuelven a
  intentar respetando `benchmark_overrides`. **Solo** afecta a `notfound`: las filas
  `ok` y `manual` se siguen excluyendo (no se re-scrapean nunca). Implementación: cargar
  el set de claves `notfound` por tabla y, con el flag, `needed = distinct(specs) menos
  (ok ∪ manual)`; sin el flag, como hoy (`menos cualquier fila existente`).

Nota: para Snapdragon, tras `--rekey` las claves nuevas no tienen fila → se scrapean en
una corrida normal; `--retry-notfound` es para la cola larga (Componente 2).

### Componente C — Benchmarks manuales (datos + guarda)

- Seed SQL idempotente nuevo `db/migrations/0034_manual_benchmarks.sql`:
  `insert into public.cpu_benchmarks (component_key, name, status, score, geekbench_single,
  geekbench_multi, cores, threads, release_year) values (…) on conflict (component_key)
  do nothing;` (análogo para GPU). `status='manual'`, números de fuentes públicas
  (Geekbench/3DMark/specs del fabricante), con comentario de origen por fila.
- **Guarda en el enricher**: `--retry-notfound` filtra a `status='notfound'`, así que
  nunca pisa una fila `manual`. Una corrida normal ya las excluye (`existingKeys`).
- No hay cambio de esquema (las columnas existen) ni de UI (mismo join).

## Población de datos (ejecución, durante la implementación)

1. **Snapdragon (A+B):** `--rekey qualcomm-snapdragon-x` → `--keys-only` → scrape CPU
   (Playwright, en local — esta máquina, IP residencial). Los X1/X1P/X1E que existan en
   nanoreview se rellenan; los que no, quedan `notfound` o pasan a manual.
2. **Cola larga (overrides):** para las notfound de mayor cobertura, verificar el slug
   real con `--dump`, añadir fila en `benchmark_overrides` y correr `--retry-notfound`.
3. **Manuales:** rellenar el seed con los ausentes de mayor cobertura (Apple M4 Pro,
   M4/M5 Max y los que se confirmen ausentes en el paso 1/2).

## Manejo de errores

- Scrape no fatal (muro/404/error ya gestionados en el enricher; los muros no persisten,
  se reintentan).
- `--rekey` idempotente (null + refill). El seed manual `on conflict do nothing`.
- `--retry-notfound` no puede pisar `ok`/`manual` (filtra a `notfound`).

## Tests

- `lib/benchmarks/normalize.test.ts`: casos Snapdragon con los nombres reales de la BD:
  - `"… Snapdragon X1-26-100 …"` → `qualcomm-snapdragon-x1-26-100`
  - `"… Snapdragon X1P-42-100 …"` → `qualcomm-snapdragon-x1p-42-100`
  - `"… Snapdragon X1E-78-100 …"` y `X1E-80-100` → `…-x1e-78-100` / `…-x1e-80-100`
  - `"… Snapdragon X …"` (sin código) → `qualcomm-snapdragon-x` (no rompe el fallback)
  - regresión: un Intel/AMD existente sigue dando la misma clave.
- El grueso del enricher es I/O Playwright (no unit-testeado, igual que hoy; verificación
  manual en local). `--rekey`/`--retry-notfound` se verifican con `--dry-run`/`--keys-only`.
  Se mantiene la convención del repo (solo lógica pura en Vitest; CI = lint+typecheck+test).

## No-objetivos (YAGNI)

- No tocar el join ni la UI de ficha/comparar.
- No cron (el enricher de benchmarks es manual por IP de datacenter; sigue igual).
- No perseguir el 100% de la cola larga: por cobertura.
- No refactor del enricher más allá de los dos flags.
- No tabla nueva ni cambio de esquema (las columnas ya existen).
