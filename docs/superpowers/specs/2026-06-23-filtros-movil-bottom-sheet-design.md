# Diseño: filtros en bottom-sheet (móvil)

**Fecha:** 2026-06-23
**Estado:** aprobado (pendiente de revisión del spec por el usuario)

## Problema

En la home, los filtros viven en un `<aside>` sticky a la izquierda en ≥md
(`app/page.tsx`: grid `md:grid-cols-[15rem_1fr]`, `LaptopFilters`). En móvil (<md) el
grid colapsa a una columna y el panel de filtros (precio, ~20 marcas, serie, RAM,
pantalla, estado, características) se **apila encima** del grid, así que hay que hacer
scroll por todo el panel para llegar a los portátiles. Pendiente recogido en la bitácora:
"Sidebar de filtros en móvil real: hoy se apila; valorar un panel desplegable".

## Decisiones

- **Móvil: botón "Filtros (N)" + bottom-sheet.** Una barra con el botón (solo <md); al
  tocarlo sube una hoja desde abajo, sobre el contenido, con los filtros y un botón
  "Ver resultados (N)". El grid queda arriba del todo. Patrón e-commerce estándar.
  Descartados en brainstorming: acordeón colapsable (empuja contenido), chips rápidos +
  panel (más superficie), panel lateral / pantalla completa (menos natural en móvil).
- **≥md sin cambios**: el sidebar sticky actual se conserva tal cual.
- **Reutilizar `LaptopFilters` tal cual** dentro del sheet (una sola fuente de verdad de
  los controles y de la lógica de URL).
- **Aplicación en vivo** (igual que hoy: cada toggle hace `router.replace` al instante).
  "Ver resultados (N)" solo **cierra** el sheet.
- **Sin dependencia nueva** (regla del repo): panel propio con overlay fijo + transición
  Tailwind, como ya hace `components/cookie-banner.tsx`. No hay lib de dialog/drawer.

## Arquitectura

### 1. `app/page.tsx`
- El `<aside>` con `LaptopFilters` pasa a **solo escritorio**: añadir `hidden md:block`
  (o `hidden md:sticky …`) para que no se renderice apilado en móvil.
- Añadir `<MobileFilters brands={allBrands} productLines={productLines} total={count} />`
  fuera del grid (arriba), visible solo en móvil (`md:hidden`). `count` = total de
  resultados que la página ya calcula para la paginación (`count: 'exact'`).
- El grid de resultados (`1fr`) no cambia.

### 2. `components/mobile-filters.tsx` (client, nuevo)
Props: `{ brands: string[]; productLines: ProductLine[]; ramOptions?: number[]; total: number }`.

- **Barra sticky** (solo <md, `sticky top-0 z-30` con fondo para no transparentar el
  grid al hacer scroll): botón "Filtros" con un badge `N` =
  `countActiveFilters(searchParams)`. Estilo coherente con las pills existentes
  (borde, `a11y-tap`). Así los filtros quedan accesibles mientras se hace scroll del grid.
- **Estado** `open` (`useState(false)`).
- **Sheet** cuando `open`:
  - Backdrop `fixed inset-0 z-40 bg-black/40` (cierra al tocar).
  - Panel `fixed inset-x-0 bottom-0 z-50 max-h-[85vh] rounded-t-2xl bg-white dark:bg-zinc-950`,
    con transición de entrada (translate-y). Estructura en 3 zonas:
    - **Cabecera** sticky: título "Filtros" + botón ✕ (cierra).
    - **Cuerpo** scrollable (`overflow-y-auto`): `<LaptopFilters … />` (mismos props).
    - **Footer** sticky: botón "Ver resultados ({total})" que cierra el sheet.
  - **UX**: bloquear scroll del body al abrir (`document.body.style.overflow='hidden'`,
    restaurar al cerrar, en un `useEffect` con cleanup); cerrar con `Escape`
    (listener mientras `open`); foco al botón ✕ al abrir; `role="dialog"` +
    `aria-modal="true"` + `aria-label="Filtros"`.

### 3. Lógica pura: `countActiveFilters`
Función pura (en `components/mobile-filters.tsx` o un util) que recibe algo como
`URLSearchParams` (o un getter `(key)=>string|null`) y devuelve el nº de filtros activos:
- marcas: nº de valores en `brand` (separado por comas)
- +1 por cada uno con valor: `ram_min`, `screen`, `line`, `cond`, `price_max`
- +1 por cada flag de característica activa (`gaming`, `ai`, `oled` = `'1'`)
- **NO** cuenta `q` (el buscador vive en el hero, fuera del panel).
Testeable con Vitest (entrada = `URLSearchParams`).

## Manejo de errores

- Sin red ni estado de servidor nuevo. Si `LaptopFilters` ya traga errores de
  navegación, no cambia. El sheet es puramente cliente.
- `useEffect` de scroll-lock con cleanup garantizado (restaura `overflow` aunque el
  componente se desmonte abierto).

## Tests

- **Unit (Vitest)**: `countActiveFilters` — sin filtros → 0; marcas múltiples cuentan
  cada una; ram/screen/line/cond/price suman 1; flags suman; `q` no cuenta; combinación.
- **Manual (local, no CI)**: abrir/cerrar (botón, ✕, backdrop, Escape); scroll-lock del
  body; aplicar filtros en vivo (grid detrás se actualiza); badge N correcto;
  "Ver resultados (N)" cierra; en ≥md el sheet/botón no aparece y el sidebar sigue igual;
  modo oscuro. Verificar en el breakpoint `md` (768px).

## No-objetivos (YAGNI)

- No tocar el sidebar de escritorio ni la lógica de filtrado/URL de `LaptopFilters`.
- No mover el buscador `?q=` (sigue en el hero).
- No añadir dependencias (drawer/dialog se hace a mano).
- No "aplicar al cerrar" / borradores: la aplicación sigue en vivo.
- No gestos de arrastre para cerrar (drag-to-dismiss): basta ✕ / backdrop / Escape.
