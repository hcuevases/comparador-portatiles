# Reestructura de la home + exclusión de Chromebooks — Design

**Fecha:** 2026-07-01
**Rama:** `feat/home-catalogo-split` (desde `main`, con Chollos #91 ya mergeado)

## Objetivo

Dos cambios que llegan juntos:

1. **La portada (`/`) deja de mostrar el catálogo completo.** Muestra solo el hero + las tres
   secciones curadas (Chollos, Destacados, Novedades) + un CTA "Explorar todo el catálogo". El
   catálogo entero (rejilla + filtros + orden + paginación) se muda a una ruta nueva **`/catalogo`**.
2. **Los Chromebooks desaparecen de las tres secciones** de la portada, pero **siguen en el
   catálogo** (`/catalogo`) y en la búsqueda.

## Decisiones (acordadas con el usuario)

- Ruta del catálogo completo: **`/catalogo`**.
- Buscador del hero: **navega a `/catalogo?q=`** al buscar por marca/modelo (opción A). El hero se
  **mantiene también** en `/catalogo`.
- Chromebooks: **siguen en el catálogo**; solo se excluyen de las secciones.

## Arquitectura

### Split de páginas

**`app/page.tsx` (portada, `/`)** queda reducida a un Server Component ligero:
- `<HomeHero />`
- Banner `?message=` (confirmaciones de acciones de cuenta — p.ej. cambio de contraseña redirige a
  `/?message=…`; se conserva aquí).
- `<DealsSection />`, `<FeaturedSection />`, `<NovedadesSection />`.
- Un bloque CTA **"Explorar todo el catálogo"** con enlace a `/catalogo`.
- **Se elimina** de esta página toda la lógica de `search_laptops`, filtros, orden, paginación,
  `EmptyState`, `buildCatalogQuery` y los helpers asociados.

**`app/catalogo/page.tsx` (nueva, `/catalogo`)** recibe **tal cual** la lógica que hoy vive en
`app/page.tsx`:
- `<HomeHero />` (reutilizado; ver comportamiento adaptativo abajo).
- Cabecera "Explora el catálogo".
- Consulta de marcas (`distinct_brands`), líneas (`distinct_product_lines`) y `search_laptops` con
  todos los filtros y paginación (idéntico a hoy).
- Filtros: `<MobileFilters>` (bottom-sheet móvil) + `<LaptopFilters>` (sidebar ≥md).
- `<SortSelect>`, `<LaptopGrid>`, `<Pagination>`, `<EmptyState>`.
- `basePath` de la paginación pasa de `/` a `/catalogo`.
- `buildCatalogQuery` y el `?from=` de las cards apuntan a `/catalogo` (ver navegación).

No se extrae un componente compartido para la parte de catálogo: se mueve entera a la nueva ruta.
Lo único compartido entre `/` y `/catalogo` es `<HomeHero>`, que ya es un componente aparte.

### Comportamiento adaptativo del hero (`components/home-hero.tsx`)

El hero se renderiza en `/` y en `/catalogo`. Distingue por `usePathname()`. **No se añade ningún
botón nuevo**: la única pieza clicable sigue siendo "Recomiéndame" (IA); la búsqueda de texto se
dispara con Enter en el input.

- **En `/catalogo`** — comportamiento **idéntico al de la home de hoy**, sin regresión:
  - Teclear filtra **en vivo** con debounce (`router.replace` de `?q=` en la propia página, sin
    scroll); la rejilla de abajo reacciona.
  - Enter → `/asistente?q=…` (IA), igual que hoy.
- **En `/`** (portada, sin catálogo debajo):
  - Teclear **no** filtra en vivo (no hay rejilla que filtrar).
  - Enter → `router.push('/catalogo?q=' + encodeURIComponent(q))` (búsqueda de texto = ir al
    catálogo ya filtrado). Este es el único cambio de comportamiento del hero respecto a hoy.
- **"Recomiéndame"** y las píldoras de ejemplo → `/asistente?q=…` en **ambas** páginas (sin cambios).

Implementación: el `useEffect` de debounce solo actúa si `pathname === '/catalogo'`. El `onKeyDown`
de Enter bifurca por pathname: en `/catalogo` llama a `ask()` (IA, como hoy); en `/` llama a un nuevo
`search()` que hace `router.push('/catalogo?q=…')`. La subida del texto de ayuda ("Búscalo por marca
o modelo, o cuéntale a la IA") sigue siendo válida en ambas.

### Exclusión de Chromebooks — migración `0044_exclude_chromebooks.sql`

`create or replace` de las tres RPCs de sección añadiendo el mismo filtro sobre `laptops l`:

```sql
and l.model !~* 'chromebook' and l.slug !~* 'chromebook|chromeos'
```

- `home_deals` (definida en 0043): el filtro entra en el `where` final (ya hace `join laptops l`).
- `home_featured` (0038): en el CTE `feat` (`where l.featured_rank is not null and …`).
- `home_novedades` (0039): en el CTE `per_brand`, junto al regex de no-portátiles ya existente.

Detección validada contra el dato real: `model ~* 'chromebook'` (58) ∪ `slug ~* 'chromebook|chromeos'`
= **60** Chromebooks, incluidos 2 Lenovo "Chrome 2in1" que no dicen "chromebook" en el modelo pero sí
"chromeos" en el slug. `search_laptops` **no se modifica** → el catálogo los mantiene.

La migración se aplica por Management API (PAT en `.env.local`) y se versiona en `db/migrations/`.

### Navegación

- **`components/back-to-catalog.tsx`**: `BackToCatalog` pasa de `href = from ? '/?'+from : '/'` a
  `from ? '/catalogo?'+from : '/catalogo'`. `BackToCatalogFallback` de `'/'` a `'/catalogo'`.
- **`components/nav-bar.tsx`**: se añade un enlace **"Catálogo"** → `/catalogo` en la `<nav>` (antes
  o junto a "Asistente IA"). El logo sigue → `/`.
- Enlaces genéricos "volver al inicio" en otras páginas (mis-alertas, mis-comparativas, privacidad,
  layout auth, comparar) siguen apuntando a `/` (es la portada/home), no se tocan.

## Flujo de datos

- `/` → 3 RPCs de sección (con Chromebooks excluidos). Sin `search_laptops`.
- `/catalogo` → `distinct_brands` + `distinct_product_lines` + `search_laptops` (con Chromebooks),
  exactamente como hoy la home.
- Hero en `/`: submit → `push('/catalogo?q=…')`. Hero en `/catalogo`: teclear → `replace` de `?q=`.

## Manejo de errores

- Igual que hoy: si `search_laptops`/`distinct_*` fallan en `/catalogo`, se pinta `ErrorBox`.
- Las tres secciones ya son tolerantes (si su RPC falla o no hay filas, la sección se oculta; la
  portada sigue viva).

## Testing

- **`e2e/home.spec.ts`**: la portada ya no muestra rejilla ni contador "N series · página…". Se
  reorienta: la portada muestra el hero, ≥1 sección y el CTA "Explorar"; los tests de secciones
  (Destacados/Novedades/Chollos, tolerantes) se mantienen.
- **`e2e/catalogo.spec.ts` (nuevo)**: `/catalogo` muestra rejilla (`a[href^="/portatiles/"]`) +
  contador + filtros; buscar en el hero de `/` (teclear + Enter) navega a `/catalogo?q=` y la URL
  refleja el término.
- **Filtros/ficha**: los e2e que hoy arrancan en `/` para filtrar (`e2e/filters.spec.ts`,
  `e2e/mobile-filters.spec.ts`) pasan a `/catalogo`. El de ficha (`e2e/detail.spec.ts`) arranca de la
  card en `/catalogo` o de una sección de `/`.
- Gate completo (lint · typecheck · vitest · e2e) en verde antes del PR. No `prettier --write` (CRLF).

## Fuera de alcance

- El fix de raíz de datos (detección del precio alto-erróneo en la ingesta) sigue siendo un
  sub-proyecto aparte.
- No se añade panel de admin ni se cambia el curado de Destacados.
- No se cambia `search_laptops` (los Chromebooks permanecen en el catálogo por decisión explícita).
