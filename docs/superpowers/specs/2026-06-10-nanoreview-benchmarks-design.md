# Enriquecer specs con benchmarks de nanoreview — Diseño

**Fecha:** 2026-06-10
**Estado:** aprobado (brainstorming) — pendiente de plan de implementación
**Sub-proyecto:** (2) de la tanda "más specs + Amazon/dedup". Dedup/Amazon es ciclo aparte.

## Objetivo

Añadir datos de rendimiento (benchmarks de CPU y GPU) a cada portátil, obtenidos de
nanoreview.net **por componente** (no por portátil), para que la ficha y la
comparativa muestren rendimiento comparable. Un mismo componente (p.ej. RTX 4060
Laptop) lo comparten cientos de portátiles → se scrapea una vez y se reutiliza.

## Decisiones tomadas (brainstorming)

- **Datos curados** (no mínimos ni exhaustivos):
  - CPU: nota global nanoreview (0-100), Geekbench single/multi, núcleos/hilos, TDP, año.
  - GPU: nota global, 3DMark, VRAM, TDP.
- **Ejecución:** Playwright **local/manual**, incremental. nanoreview está tras
  anti-bot (403 a fetch plano); un Chromium real pasa el reto. Coherente con la
  decisión de mantener el cron de enrich-specs manual (Cloudflare bloquea IPs de
  datacenter de GitHub Actions).
- **Almacenamiento/matching:** tablas por componente + clave normalizada + tabla de
  overrides (enfoque A; alternativas denormalizada y al-vuelo descartadas).
- **Dónde se muestra:** ficha + comparativa.

## No-objetivos (YAGNI, este ciclo)

- Que el score alimente el asistente IA o los filtros de la home.
- Amazon / deduplicación del catálogo (sub-proyecto independiente).
- Hacer el scraping periódico en CI (requeriría unblocker de pago; se queda manual).

## Arquitectura

Pipeline **offline** idéntico en filosofía a `scripts/enrich-specs.ts`:

```
scripts/enrich-benchmarks.ts   (Playwright, local/manual, incremental)
   │  1. distinct specs.cpu/gpu → normaliza → rellena specs.cpu_key/gpu_key
   │  2. claves sin fila de componente → resuelve slug nanoreview → scrapea → upsert
   ▼
cpu_benchmarks / gpu_benchmarks   (1 fila por componente)
   ▲
   │  join LEFT por specs.cpu_key / specs.gpu_key
app/portatiles/[slug]/page.tsx   (sección "Rendimiento")
app/comparar/page.tsx            (filas rankeables)
```

La web no llama a nanoreview en caliente: lee de Supabase como todo lo demás. No se
toca el ISR de la ficha.

## Modelo de datos (migración `db/migrations/0023_benchmarks.sql`)

### Tabla `cpu_benchmarks`

| columna           | tipo          | notas                                            |
|-------------------|---------------|--------------------------------------------------|
| `component_key`   | text PK       | clave normalizada, ej. `core-i7-1355u`           |
| `name`            | text          | nombre display (de nanoreview)                   |
| `nanoreview_slug` | text null     | slug usado en la URL                             |
| `status`          | text          | `ok` \| `notfound`                               |
| `score`           | int null      | nota global nanoreview (0-100)                   |
| `geekbench_single`| int null      |                                                  |
| `geekbench_multi` | int null      |                                                  |
| `cores`           | int null      |                                                  |
| `threads`         | int null      |                                                  |
| `tdp_w`           | int null      |                                                  |
| `release_year`    | int null      |                                                  |
| `scraped_at`      | timestamptz   | cuándo se intentó (marca incremental)            |

### Tabla `gpu_benchmarks`

| columna           | tipo          | notas                                            |
|-------------------|---------------|--------------------------------------------------|
| `component_key`   | text PK       | ej. `rtx-4060-laptop`                            |
| `name`            | text          |                                                  |
| `nanoreview_slug` | text null     |                                                  |
| `status`          | text          | `ok` \| `notfound`                               |
| `score`           | int null      | nota global                                      |
| `g3dmark`         | int null      | puntuación 3DMark que muestra nanoreview         |
| `vram_gb`         | int null      |                                                  |
| `tdp_w`           | int null      |                                                  |
| `scraped_at`      | timestamptz   |                                                  |

### Cambios en `specs`

- `cpu_key text null` — FK lógica a `cpu_benchmarks.component_key` (ON DELETE SET NULL).
- `gpu_key text null` — FK lógica a `gpu_benchmarks.component_key`.
- Índices en ambas para el join.

### Tabla `benchmark_overrides`

| columna           | tipo   | notas                                       |
|-------------------|--------|---------------------------------------------|
| `kind`            | text   | `cpu` \| `gpu`                              |
| `source_key`      | text   | clave que produjo el normalizador           |
| `nanoreview_slug` | text   | slug correcto a usar                         |
| PK                | (`kind`,`source_key`) |                              |

El enricher consulta overrides **antes** de adivinar el slug. Editable por SQL para
corregir casos sueltos sin tocar código.

### RLS

Lectura pública en las tres tablas nuevas (`select` para `anon`/`authenticated`),
como el resto de tablas de catálogo. Escritura solo service role (el enricher).

## Normalizador (función pura — `lib/benchmarks/normalize.ts`)

El corazón testeable. Contrato:

```ts
export function normalizeCpuKey(raw: string): string | null;
export function normalizeGpuKey(raw: string): string | null;
```

**CPU** — quita marca (`Intel`/`AMD`/`Apple`) y marketing (`Processor`, `CPU`,
`with Radeon Graphics`, sufijos de RAM…), extrae el modelo y lo *slugifica*:

| entrada                              | salida              |
|--------------------------------------|---------------------|
| `Intel Core i7-1355U`                | `core-i7-1355u`     |
| `Intel Core Ultra 7 155H`            | `core-ultra-7-155h` |
| `AMD Ryzen 7 7840HS`                 | `ryzen-7-7840hs`    |
| `Apple M3 Pro`                       | `m3-pro`            |
| (texto sin modelo reconocible)       | `null`              |

**GPU** — quita marca (`NVIDIA`/`AMD`/`Intel`/`GeForce`/`Radeon`), normaliza y, para
GPU de portátil, añade `-laptop` (nanoreview separa portátil de sobremesa):

| entrada                              | salida              |
|--------------------------------------|---------------------|
| `NVIDIA GeForce RTX 4060`            | `rtx-4060-laptop`   |
| `AMD Radeon RX 7600S`                | `radeon-rx-7600s`   |
| `Intel Arc A370M`                    | `arc-a370m`         |
| `Intel Iris Xe Graphics` (integrada) | `iris-xe` (se intenta) |
| (desconocida)                        | `null`              |

Las correspondencias exactas slug↔nanoreview se afinan con casos reales del catálogo
durante la implementación (se extraen los `distinct specs.cpu/gpu` y se construye la
tabla de tests). Los que no casen → `benchmark_overrides`.

## Scraper (`scripts/enrich-benchmarks.ts`, `npm run enrich:benchmarks`)

Reutiliza el patrón de `enrich-specs.ts`: `chromium.launch({ headless: true })`,
**contexto fresco por página** (el reto anti-bot no se autorresuelve si se reusa la
sesión), espera a que pase el reto y aparezca el contenido, reinicio del navegador
cada N páginas, `--limit`, `--dry-run`, `--delay`.

Flujo:

1. **Rellenar claves:** leer `distinct specs.cpu` y `distinct specs.gpu`; para cada
   valor, `normalizeCpuKey/GpuKey`; `update specs set cpu_key/gpu_key` en las filas
   con ese valor. (Las filas con clave `null` quedan sin benchmark.)
2. **Scrapear componentes nuevos:** claves distintas que aún no tienen fila en
   `cpu_benchmarks`/`gpu_benchmarks`, hasta `--limit`. Para cada una:
   - resolver `nanoreview_slug`: `benchmark_overrides` → si no, construir
     `https://nanoreview.net/en/cpu/<key>` (o `/gpu/<key>`) y verificar que el título
     casa el componente; si 404/no casa, intentar el buscador de nanoreview.
   - parsear los campos curados de la página.
   - `upsert` con `status='ok'` + datos, o `status='notfound'` si no se resuelve.
3. **Marcas (incremental):** `notfound` se persiste → no se reintenta. `wall`/error de
   red → **no** se persiste → se reintenta en otra tanda. (Igual criterio que
   `enriched_at` en enrich-specs.)

## UI

### Ficha (`app/portatiles/[slug]/page.tsx`)

Nueva sección **"Rendimiento"** tras "Especificaciones", solo si hay benchmark de CPU
o GPU. Dos tarjetas (CPU / GPU) con la nota 0-100 destacada (barra o número grande) y
los campos curados. Nota al pie: "Datos de rendimiento de nanoreview.net".
La página añade el join de `cpu_benchmarks`/`gpu_benchmarks` por `specs.cpu_key/gpu_key`.

### Comparativa (`app/comparar/page.tsx`)

Filas nuevas, todas rankeables (mayor = mejor), que se enganchan al `winnersOf` ya
existente (resaltado de "mejor valor"):
`Puntuación CPU`, `Geekbench (multi)`, `Puntuación GPU`, `3DMark`.
La query de `/comparar` añade `cpu_key/gpu_key` al select de specs + un fetch de los
benchmarks de esos componentes.

## Errores y degradación

- `normalize* → null`: la fila no tiene clave → sin benchmark. No rompe nada.
- Clave con componente aún no scrapeado (`null` en la tabla): la UI lo oculta / `—`.
- Parseo parcial en nanoreview: se guardan los campos que se obtengan (todos nullable).
- nanoreview caído / muro: el enricher lo reintenta; la web no se entera (lee de BD).

## Testing

- **Unit (TDD), alto valor:**
  - `normalizeCpuKey` / `normalizeGpuKey`: tabla de casos con cadenas **reales** del
    catálogo → clave esperada (incluye casos que deben dar `null`).
  - Parser de campos de nanoreview: *fixtures* HTML guardados → objeto parseado.
- **Integración (manual):** la navegación Playwright contra nanoreview no se
  unit-testea (mismo criterio que enrich-specs); se verifica con `--dry-run` sobre
  unos cuantos componentes reales.
- CI sigue siendo lint + typecheck (no hay framework de tests aún en el repo; este
  sub-proyecto introduce los primeros tests unitarios → el plan decidirá el runner,
  apuesta por defecto **Vitest**, ya anotado en pendientes del vault).

## Documentación

- Esta spec (repo, convención superpowers).
- `ADR-005-benchmarks-nanoreview` en el vault (decisión arquitectónica, regla del repo).
- Nota `27-benchmarks-nanoreview.md` en el vault + entrada en bitácora al implementar.
- Migración versionada en `db/migrations/`.

## Riesgos / cuestiones abiertas

- **Cobertura del matching:** la calidad depende del normalizador. Mitigación:
  tests con casos reales + tabla de overrides. Aceptamos cobertura parcial al
  principio (como con enrich-specs).
- **Estabilidad del DOM de nanoreview:** si cambia su maquetación, el parser se
  rompe. Mitigación: parser difuso + fixtures que detectan regresiones.
- **Runner de tests:** introducir Vitest es nueva dependencia; el plan lo confirma
  contra la regla "menos piezas" (no hay alternativa nativa para unit tests).
