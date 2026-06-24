# Diseño: sección "Destacados" en la home (sub-proyecto 2 del rediseño)

**Fecha:** 2026-06-24
**Estado:** aprobado (pendiente de revisión del spec por el usuario)

## Contexto

Segundo sub-proyecto del rediseño de la home (estructura acordada: Hero → Destacados →
Chollos → Catálogo). Este entrega la sección **Destacados** (escaparate editorial curado),
el primer feed fiable de la home. No depende del dato de precios para "decidir" qué mostrar
(eso lo decides tú), y el precio mostrado ya es fiable tras el fix #87.

El sub-proyecto 1 (Chollos) queda **en pausa** (rama `feat/home-chollos`) hasta pulir la
detección sobre dato limpio; cuando se retome reutilizará `<HomeRow>`, que crea ESTE spec.

## Decisiones

- **Curado por columna `laptops.featured_rank` vía SQL** (Management API). Sin panel de admin
  (ver "Trabajo futuro"). null = no destacado; número menor = aparece antes.
- **Reutilizar la card del catálogo** (`LaptopCardItem`) sin campos de oferta.
- **`<HomeRow>`** (fila reutilizable) se crea aquí; la copia en la rama de chollos (en pausa)
  se reconcilia al retomar chollos.
- **Lógica de precio en SQL** (RPC), una sola fuente de "precio actual".

## Arquitectura

### 1. Datos
- Migración `db/migrations/0038_featured_laptops.sql`:
  - `alter table public.laptops add column if not exists featured_rank smallint;`
  - Índice parcial: `create index if not exists laptops_featured_rank_idx on public.laptops (featured_rank) where featured_rank is not null;`
  - **RPC `home_featured(p_limit int default 8)`** (`security invoker`, `stable`):
    - `feat` = laptops con `featured_rank is not null` y `discontinued_at is null`, ordenados
      por `featured_rank`, tope `p_limit`.
    - Precio actual = último por retailer → mínimo, **solo sobre los ids de `feat`** (conjunto
      pequeño → no necesita materializar).
    - Devuelve filas listas para card: `id, slug, brand, model, image_url, current_price_eur,
      ram_gb, cpu, screen_inches`, ordenadas por `featured_rank`.
    - `grant execute … to anon, authenticated`.
- **Curado inicial**: tras crear la columna, se marcan ~6-8 portátiles vía SQL (mezcla de
  marcas/precios, con imagen y precio válidos). Ajustable luego con un `UPDATE`.

### 2. UI
- **`components/home-row.tsx`** (Server Component): cabecera (icono + título + subtítulo
  opcional) + fila responsive de cards (scroll horizontal con snap en móvil, grid en ≥md).
  Hijos = `<li>` (LaptopCardItem). Reutilizable.
- **`components/featured-section.tsx`** (Server Component async): consulta `home_featured`,
  y si hay filas pinta un `<HomeRow>` (icono estrella, título "Destacados") con
  `LaptopCardItem` (chips = cpu / `${ram_gb} GB` / `${screen_inches}"`, sin oferta). Si la
  RPC falla o no hay destacados → no renderiza nada (no fatal).
- **`app/page.tsx`**: renderizar `<FeaturedSection />` entre el hero y el bloque de catálogo
  (antes del `<MobileFilters>` / grid). El catálogo + filtros quedan intactos, debajo.

### 3. Engagement
- "Añadir a comparar" desde el feed (reutiliza el `+` de `LaptopCardItem`); la cesta flotante
  ya persiste y lleva a `/comparar`.

### 4. Manejo de errores / rendimiento
- RPC en `try/catch`/error de Supabase; si falla, la sección no se pinta. Conjunto ≤8 ids →
  sin coste relevante.

## Tests
- **RPC**: verificación manual vía Management API (devuelve los curados, en orden, con precio
  real).
- **e2e (Playwright)**: añadir a `e2e/home.spec.ts` un test tolerante: si aparece la cabecera
  "Destacados", la sección tiene ≥1 card de ficha. (No frágil: si no hay curados, se omite.)
- `npm run lint && typecheck && test && e2e` en verde (e2e es gate obligatorio).

## Trabajo futuro (apuntado, no en este sub-proyecto)
- **Mini-panel de admin** para marcar/desmarcar destacados desde la web (toggle por clic),
  en vez de SQL. Requiere auth de admin + página protegida + acción de servidor. Cuando el
  curado manual por SQL se quede corto.
- Retomar **Chollos** (sub-1) sobre dato de precios limpio, con referencia por **mediana**.

## No-objetivos (YAGNI)
- Panel de admin (futuro, ver arriba).
- Chollos (sub-1, en pausa).
- Personalización por usuario; señales automáticas de popularidad.
- No tocar la lógica del catálogo/filtros.
