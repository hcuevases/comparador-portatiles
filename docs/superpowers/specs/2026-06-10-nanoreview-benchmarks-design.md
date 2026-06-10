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

## Realidad de los datos (hallazgo en implementación, 2026-06-10)

Suposición inicial del diseño: `specs.cpu`/`specs.gpu` contenían el modelo concreto.
**Falso.** Lo que hay realmente:

- `specs.cpu` = **familia** de Algolia (`Intel Core Ultra 7`, `AMD Ryzen 7`…), nunca
  el modelo (`i7-1355U`). Inservible para casar con nanoreview (una familia tiene
  muchos modelos con rendimientos distintos).
- El **modelo concreto SÍ aparece en `laptops.model`** (el nombre) en ~**73%** de los
  casos: `i7-13620H`, `Core Ultra 7 255H`, `Ryzen AI 7 350`, `Snapdragon X Elite`…
- `specs.gpu` SÍ trae el modelo dedicado cuando existe (`GeForce RTX 5060`,
  `Radeon RX 7600S`); el ~68% es `Gráfica Integrada` (sin GPU dedicada → sin benchmark
  dedicado, esperable).

**Consecuencia para el diseño:** la fuente del modelo de CPU es `laptops.model`
(parseado por regex), con `specs.cpu` como pista de marca/familia. La GPU se toma de
`specs.gpu` (si no es integrada) con `laptops.model` como respaldo. Cobertura parcial
asumida (~70% CPU; GPU sobre todo en portátiles con gráfica dedicada). Sin paso previo
de scraping para el modelo — se extrae de datos que ya tenemos.

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

## Extracción + normalización (función pura — `lib/benchmarks/normalize.ts`)

El corazón testeable. **Extrae el modelo del NOMBRE del portátil** (no de `specs.cpu`,
que es la familia) y lo normaliza a clave. Contrato:

```ts
// Recibe el nombre del portátil (laptops.model) y, como pista, specs.cpu (familia).
export function extractCpuKey(laptopName: string, cpuFamily: string | null): string | null;
// Recibe specs.gpu (modelo dedicado si lo hay) con laptops.model como respaldo.
export function extractGpuKey(gpuRaw: string | null, laptopName: string): string | null;
```

**CPU** — busca en el nombre patrones de modelo (`i[3579]-NNNNN`, `Core Ultra [579]
NNN[letra]`, `Ryzen [AI ][3579] NNNN`, `Snapdragon X …`, `M[1-5] [Pro/Max]`), quita
marketing y *slugifica*. `null` si el nombre no trae modelo (≈27%).

| nombre del portátil (extracto)                         | salida                |
|--------------------------------------------------------|-----------------------|
| `…Intel Core i7-13620H/32GB/1TB SSD/RTX 4060…`         | `core-i7-13620h`      |
| `…Intel Core Ultra 7 255H 32GB 1TB SSD…`               | `core-ultra-7-255h`   |
| `…AMD Ryzen AI 7 350 32GB Radeon 860M…`                | `ryzen-ai-7-350`      |
| `…Snapdragon X Elite 13" 16GB…`                        | `snapdragon-x-elite`  |
| `…ThinkPad … Intel Core i5 16GB…` (sin modelo)         | `null`                |

**GPU** — de `specs.gpu` si no es integrada; quita marca (`NVIDIA`/`GeForce`/`Radeon`),
y para GPU de portátil añade `-laptop` (nanoreview separa portátil de sobremesa):

| entrada (`specs.gpu`)                | salida              |
|--------------------------------------|---------------------|
| `GeForce RTX 5060`                   | `rtx-5060-laptop`   |
| `AMD Radeon RX 7600S`                | `radeon-rx-7600s`   |
| `Gráfica Integrada`                  | `null` (sin dedicada)|
| `RTX 2000` (workstation)             | `rtx-2000-laptop`   |

Las correspondencias exactas slug↔nanoreview se afinan con casos reales del catálogo
durante la implementación (los `distinct` se extraen de la BD y se construye la tabla
de tests). Los que no casen → `benchmark_overrides`.

## Scraper (`scripts/enrich-benchmarks.ts`, `npm run enrich:benchmarks`)

Reutiliza el patrón de `enrich-specs.ts`: `chromium.launch({ headless: true })`,
**contexto fresco por página** (el reto anti-bot no se autorresuelve si se reusa la
sesión), espera a que pase el reto y aparezca el contenido, reinicio del navegador
cada N páginas, `--limit`, `--dry-run`, `--delay`.

Flujo:

1. **Rellenar claves:** leer `laptops.model` + `specs.cpu`/`specs.gpu` por portátil;
   `extractCpuKey(model, cpuFamily)` y `extractGpuKey(gpu, model)`; `update specs set
   cpu_key/gpu_key`. (Las filas con clave `null` quedan sin benchmark — ≈27% CPU y los
   de gráfica integrada.) Este paso es **puro/local** (no toca nanoreview), así que se
   puede correr aunque el scraping de benchmarks falle.
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
