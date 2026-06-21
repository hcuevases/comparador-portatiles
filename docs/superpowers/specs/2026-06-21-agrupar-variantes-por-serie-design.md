# Diseño: agrupar variantes por serie en el grid

**Fecha:** 2026-06-21
**Estado:** aprobado (pendiente de revisión del spec por el usuario)
**Alcance:** solo visualización (no limpieza de datos)

## Problema

PcComponentes empaqueta toda la configuración (pantalla, CPU, RAM, almacenamiento,
GPU, color, SO) dentro del **título** del producto, y ese título es la columna
`laptops.model`. Resultado: cada configuración de un mismo modelo es una fila
`laptops` independiente, y el grid de la home se llena de cards casi idénticas
("lo mismo repetido").

Medición sobre el catálogo (4558 laptops activas, no reacondicionadas):

- 1515 series con **1 sola** configuración.
- 314 series con **2+** configuraciones, que agrupan ~1770 laptops.
- Ejemplos: `Lenovo ThinkPad T14 Gen 6` (27), `HP EliteBook 6 G1i` (22),
  `Dell Pro 14 Essential PV14250` (21).

`specs.product_line` **no sirve** como clave de agrupación: es demasiado amplio
("Lenovo ThinkPad" = 220 filas, una familia comercial entera).

**Nota:** existe un problema aparte (no cubierto aquí) — ~151 filas duplicadas por
un cambio en la generación del slug (`15,6"` → antes `156`, ahora `15-6`). Esas
filas viejas ya están descatalogadas y `search_laptops` las filtra, así que **no
se ven en el sitio**. Su limpieza/fusión (preservando histórico de precios) es un
sub-proyecto independiente.

## Decisiones tomadas (brainstorming)

1. **Alcance:** solo visualización (B). El cruft de slug (A) queda fuera.
2. **Patrón de visualización:** B1 — card representativa con imagen por serie
   (conserva el grid visual actual), expandible inline. (Descartados: A = una
   ficha por modelo con selector estilo e-commerce; C = lista al entrar; B2 =
   lista densa sin imágenes.)
3. **Comparador:** sin botón "comparar toda la serie". La selección sigue siendo
   por configuración concreta. El modelo de datos de comparativa no cambia.
4. **Expandir inline** en el grid (no navegar a una página de serie).
5. **Clave de serie:** enfoque 2 — columna materializada `series_key` calculada
   por trigger, con override manual. (Descartados: 1 = al vuelo en el RPC, sin
   corregibilidad ni índice; 3 = tabla `series` propia, prematuro.)
6. **Chips de la card multi-config:** rango (min–max) de specs.
7. **Badge:** "N configuraciones".

## Arquitectura

Tres capas: datos (clave de serie materializada) → query (RPC que agrupa) →
frontend (cards de serie expandibles).

### 1. Modelo de datos

Migración nueva `db/migrations/NNNN_series_key.sql`:

- `alter table laptops add column series_key text;`
  El prefijo limpio del modelo, listo para mostrar (ej. `ThinkPad T14 Gen 6`).
  La agrupación es por **(brand, series_key)** — `brand` ya es columna aparte.
- `alter table laptops add column series_locked boolean not null default false;`
  Protege correcciones manuales del recálculo automático.
- Función `compute_series_key(p_model text) returns text` (`language sql immutable`):
  contiene el **regexp** — única fuente de verdad. Corta el título en el primer
  token de specs y normaliza (trim + colapsar espacios). Devuelve `null` si queda
  vacío.

  Regexp de corte (case-insensitive), recorta desde el primer match hasta el final:
  ```
  \s+(\d{1,2}([.,]\d)?\s?"|\d{1,2}([.,]\d)?\s?pulgadas|Intel|AMD|Ryzen|Snapdragon|Qualcomm|Apple\sM|Core|\d+\s?GB).*$
  ```
- Trigger `before insert or update on laptops`: si es INSERT, o si en UPDATE
  `model` cambió, y `series_locked = false`, entonces
  `new.series_key := compute_series_key(new.model)`.
  → El scraper (`scrape-catalog.ts`) y `discover.ts` **no se modifican**; el
  trigger calcula la clave para upserts y descubrimientos por igual.
- Backfill único: `update laptops set series_key = compute_series_key(model) where not series_locked;`
- Índice parcial: `create index laptops_series_idx on laptops (brand, series_key) where discontinued_at is null;`
- Regenerar tipos: `npm run db:types`.

**Corrección manual** (ej. agrupar gaming SKUs que el regexp no cubre, ver
"Limitaciones"): `update laptops set series_key = '<serie>', series_locked = true
where ...;`. El trigger y futuros backfills lo respetan.

### 2. Capa de query (RPC)

`search_laptops` pasa de devolver **una fila por configuración** a **una fila por
serie**. Mantiene exactamente los mismos parámetros de filtro que hoy.

Pipeline:
1. **Filtrado a nivel de config** (idéntico al actual): q, marca, RAM, precio,
   gaming/IA/OLED, pantalla, refurbished, refresh/peso/VRAM/batería, product_line.
2. **Agrupación por (brand, series_key)** sobre las configs que pasan el filtro:
   - `min_price` = mínimo de las configs filtradas.
   - `config_count` = nº de configs filtradas en la serie.
   - **representante** = la config filtrada más barata (nulls last). De ella
     salen `id`, `slug`, `image_url`, `model`, `cpu`.
   - rangos numéricos: `ram_min/ram_max`, `storage_min/storage_max`,
     `screen_min/screen_max`.
   - `cpu_distinct_count` (para decidir si el chip de CPU es rango o representante).
3. `total_count` = nº de **series** distintas (`count(distinct ...) over ()`),
   para la paginación por serie.
4. Orden (price_asc/desc por `min_price`, default brand) y `limit/offset` por serie.

Una serie aparece en los resultados si **≥1** de sus configs casa con los filtros;
sus agregados (min_price, rangos, count) se calculan **solo sobre las configs que
casan**.

RPC nuevo `series_configs(p_brand text, p_series_key text, <mismos parámetros de
filtro>)`: devuelve las configuraciones de una serie (id, slug, model, image_url,
min_price, cpu, ram_gb, storage_gb, screen_inches), ordenadas por precio asc. Se
invoca al expandir (carga perezosa). Aplica los mismos filtros activos para que la
lista expandida sea coherente con lo que el usuario filtró.

Ambas funciones: `language sql stable security invoker`, grant a `anon,
authenticated`. La firma cambia → patrón `drop function + create` como en 0022.

### 3. Frontend

`app/page.tsx`:
- `SearchRow` gana `series_key`, `config_count`, los rangos y `cpu_distinct_count`.
- La paginación cuenta series; `PAGE_SIZE` sigue 24.
- Las specs de la página actual ya no se traen aparte por id: los datos para los
  chips (rangos + representante) vienen en la fila del RPC.

`components/laptop-grid.tsx`:
- **Serie singleton (config_count = 1):** card idéntica a hoy — sin badge, con
  checkbox de comparar, clic en la card → ficha del producto. Aquí caen los gaming
  SKUs no agrupables: sin regresión respecto a hoy.
- **Serie multi-config (config_count > 1):** card con imagen del representante,
  "desde {min_price}", badge **"{config_count} configuraciones"**, chips de
  **rango**, y **sin** checkbox en la cabecera. Al pulsar la card, expande inline
  las cards de configuración (fetch perezoso a `GET /api/series/configs`). Cada
  card de config tiene su checkbox de comparar y enlace a su ficha.

Route Handler `app/api/series/configs/route.ts`: lee `brand`, `series` y los
filtros de la query, llama a `series_configs` y devuelve JSON. Lo consume el grid
(client component) al expandir.

Chips de rango (`buildChips`):
- RAM: `16–64 GB` (o `16 GB` si min=max).
- Almacenamiento: `512 GB–2 TB` (o valor único).
- Pantalla: `14–16″` (o único).
- CPU: si `cpu_distinct_count = 1`, el CPU corto del representante; si hay varias,
  rango "familia min–familia max" cuando sean parseables a la misma familia
  (ej. `i5–i9`), y si no, el CPU del representante. Best-effort (CPU es texto libre).

El comparador **no cambia**: selección por `laptop_id` (`useCompareSelection`),
URL `?ids=uuid1,uuid2,...`, `CompareBar` flotante idénticos. Se pueden comparar
configs de la misma serie o de series distintas.

## Flujo de datos

```
home (page.tsx)
  └─ search_laptops(filtros, limit=24 series, offset)   ← una fila por serie
       └─ grid pinta cards de serie (representante + rango + badge)
            └─ usuario expande serie multi-config
                 └─ GET /api/series/configs?brand&series&<filtros>
                      └─ series_configs(...)             ← configs de esa serie
                           └─ cards de config con checkbox → comparar / ficha
```

## Limitaciones conocidas

- **Gaming SKUs no se agrupan automáticamente.** Modelos como MSI Katana llevan el
  código de SKU por unidad en el título (`B14WGK-086XES`), que el regexp no
  distingue de un código de chasis compartido. Quedan como singletons (= como hoy).
  Corregibles a mano con `series_key` + `series_locked`.
- **Apple agrupa por línea amplia** (`MacBook Air`, `MacBook Pro`) sin separar
  generación/tamaño. Aceptable para v1; corregible a mano si molesta.
- **Chip de CPU** es best-effort por ser texto libre (ver arriba).

## No-objetivos

- Página de serie propia / SEO / contenido editorial (B1 expande inline).
- Limpieza o fusión del cruft de slug (sub-proyecto A, preserva histórico).
- Cambios en el modelo de datos de comparativa.
- UI de administración para corregir `series_key` (se hace por SQL de momento).

## Tests

- **Unit (vitest)** para helpers TS puros: `buildChips` con rangos (min=max vs
  rango, unidades GB→TB), lógica de badge/etiqueta, y selección de representante
  si se hiciera en cliente.
- **`compute_series_key`:** set de ~10 aserciones contra modelos reales (ThinkPad,
  EliteBook, Vivobook, Dell Pro con chasis, Apple, Katana edge-case, y un singleton),
  verificadas vía Management API durante la implementación. No hay test DB en CI
  (CI = lint + typecheck), así que no se automatiza.
- Verificación manual del grid agrupado en local (`npm run dev`) con filtros
  combinados (RAM + precio) para confirmar que los agregados por serie respetan el
  filtro.
```
