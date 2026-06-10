# Benchmarks de nanoreview — Plan de implementación

> **For agentic workers:** Implementar tarea a tarea. Steps con checkbox `- [ ]`.
> Verificación que corre CI: `npm run lint` y `npm run typecheck`. Tests nuevos: `npm test`.

**Goal:** Enriquecer cada portátil con benchmarks de CPU/GPU de nanoreview, casados por modelo extraído del nombre, mostrados en ficha y comparativa.

**Architecture:** Pipeline offline (Playwright local/manual) → tablas por componente → join por clave normalizada → UI. Detalle en `docs/superpowers/specs/2026-06-10-nanoreview-benchmarks-design.md`.

**Tech Stack:** Next.js 16 (RSC), Supabase (Postgres + RLS), Playwright, Vitest (nuevo, unit tests).

---

## Task 1: Setup de Vitest

**Files:**
- Modify: `package.json` (devDep `vitest` + script `test`)
- Create: `vitest.config.ts`

- [ ] Instalar: `npm i -D vitest` (justificado en spec: no hay runner nativo en Next/Supabase).
- [ ] `vitest.config.ts` con `test.environment: 'node'`, `include: ['**/*.test.ts']`, alias `@` → raíz (igual que tsconfig).
- [ ] Añadir `"test": "vitest run"` a scripts.
- [ ] Verificar: `npm test` corre (0 tests) sin error.
- [ ] Commit.

## Task 2: Extractor/normalizador (TDD)

**Files:**
- Create: `lib/benchmarks/normalize.ts`
- Test: `lib/benchmarks/normalize.test.ts`

Casos de test derivados de cadenas reales del catálogo (ver spec). Contrato:
`extractCpuKey(laptopName, cpuFamily)`, `extractGpuKey(gpuRaw, laptopName)`.

- [ ] **Test primero**: tabla de casos CPU (incluye `null`): `i7-13620H`→`core-i7-13620h`, `Core Ultra 7 255H`→`core-ultra-7-255h`, `Ryzen AI 7 350`→`ryzen-ai-7-350`, `Snapdragon X Elite`→`snapdragon-x-elite`, `M4 Pro`→`m4-pro`, nombre sin modelo→`null`. GPU: `GeForce RTX 5060`→`rtx-5060-laptop`, `AMD Radeon RX 7600S`→`radeon-rx-7600s`, `Gráfica Integrada`→`null`.
- [ ] Run: `npm test` → FALLA (función no existe).
- [ ] Implementar `normalize.ts` (regex de extracción + slugify).
- [ ] Run: `npm test` → PASA. Iterar regex hasta verde.
- [ ] `npm run lint && npm run typecheck`.
- [ ] Commit.

## Task 3: Migración 0023 (tablas + columnas)

**Files:**
- Create: `db/migrations/0023_benchmarks.sql`
- Modify: `lib/supabase/database.types.ts` (regenerar)

- [ ] SQL: `cpu_benchmarks`, `gpu_benchmarks`, `benchmark_overrides` (ver spec) + `specs.cpu_key/gpu_key` + índices + RLS lectura pública. Idempotente (`create table if not exists`, `add column if not exists`).
- [ ] Aplicar vía Management API (PAT en `.env.local`, ver memoria supabase-sql-access).
- [ ] `npm run db:types` para regenerar tipos.
- [ ] `npm run typecheck`.
- [ ] Commit.

## Task 4: Scraper `enrich-benchmarks.ts`

**Files:**
- Create: `scripts/enrich-benchmarks.ts`
- Modify: `package.json` (script `enrich:benchmarks`)

- [ ] Paso 1 (puro): por portátil, `extractCpuKey/GpuKey` → update `specs.cpu_key/gpu_key`.
- [ ] Paso 2 (Playwright): claves sin fila de componente → resolver slug (overrides → URL directa → buscador) → parsear campos curados → upsert con `status`. Reusar patrón enrich-specs (contexto fresco por página, reinicio cada N, `--limit/--dry-run/--delay`).
- [ ] Parser de campos de nanoreview en función pura `parseCpuPage/parseGpuPage(html)` para poder testearlo con fixtures.
- [ ] `npm run lint && npm run typecheck`.
- [ ] Verificación: el USUARIO corre `npm run enrich:benchmarks -- --limit 5 --dry-run` en local (IP residencial; el sandbox no llega a nanoreview). Captura 1-2 HTML reales → fixtures para tests del parser.
- [ ] Commit.

## Task 5: UI ficha — sección Rendimiento

**Files:**
- Modify: `app/portatiles/[slug]/page.tsx`

- [ ] Fetch de `cpu_benchmarks`/`gpu_benchmarks` por `specs.cpu_key/gpu_key`.
- [ ] Sección "Rendimiento" (solo si hay datos): tarjetas CPU/GPU con score 0-100 + campos curados + nota "Datos de nanoreview.net".
- [ ] `npm run lint && npm run typecheck`. Commit.

## Task 6: UI comparativa — filas de benchmarks

**Files:**
- Modify: `app/comparar/page.tsx`

- [ ] Añadir `cpu_key/gpu_key` al select + fetch de benchmarks de esos componentes.
- [ ] Filas rankeables (`Puntuación CPU`, `Geekbench (multi)`, `Puntuación GPU`, `3DMark`) en `buildRows`, `better: 'higher'`. Se enganchan a `winnersOf` existente.
- [ ] `npm run lint && npm run typecheck`. Commit.

## Task 7: Documentación

**Files:**
- Create (vault): `ADR-005-benchmarks-nanoreview.md`, `Vault Claude/comparador-portatiles/27-benchmarks-nanoreview.md`
- Modify (vault): `00-indice.md`, `05-bitacora.md`

- [ ] ADR-005 (decisión: nanoreview por componente, modelo del nombre, Playwright local).
- [ ] Nota 27 + índice + bitácora.
- [ ] PR.

## Self-Review

- **Cobertura spec:** datos curados (T2/T3 columnas), exec local (T4), ficha+comparar (T5/T6), tablas+overrides (T3), normalizador (T2). ✔
- **Sin placeholders.** ✔
- **Consistencia de tipos:** `extractCpuKey/extractGpuKey` (T2) usados en T4; columnas de T3 usadas en T5/T6. ✔

## Orden / dependencias

T1→T2 (tests necesitan runner). T2→T4 (scraper usa el extractor). T3→T4/T5/T6 (tipos/columnas). T4 entrega datos; T5/T6 funcionan vacías (degradan) sin esperar al scraping del usuario.
