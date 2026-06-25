# Salud de enlaces de afiliado (detección de enlaces rotos) — diseño

**Fecha:** 2026-06-25
**Rama:** `feat/affiliate-link-health`

## Problema

Los enlaces de afiliado se generan en `scripts/scrape-catalog.ts:404` como
`https://www.pccomponentes.com/{slug-de-Algolia}`. La URL es correcta en el momento del
scrape, pero cuando PcComponentes **retira o renombra** un producto su slug pasa a devolver
**410 Gone** (o 404). El scraper solo revisita lo que sigue apareciendo en Algolia y, en cada
pasada, reafirma `affiliate_links.active = true` (`scrape-catalog.ts:591`). Un producto
retirado del storefront pero aún presente en el índice de Algolia conserva indefinidamente
`url` + `active=true` con precio fresco → el usuario llega a una página muerta.

Caso confirmado: `MacBook Neo 13" … 512GB … Tahoe` → **410 Gone**, con precio de ayer (Algolia
va por delante del storefront).

### Restricciones descubiertas en la investigación (Fase 1 de depuración)

- **La detección obliga a HTTP.** El proxy de "frescura del precio" no sirve: el enlace muerto
  recibe precios frescos porque sigue en Algolia.
- **HTTP masivo desde nuestra IP se bloquea.** PcComponentes hace rate-limit agresivo: barridos
  con `curl` (incluso 1 petición cada 7s tras enfriado) devuelven `000` al 100%. Peticiones
  individuales espaciadas por minutos sí funcionan. Mismo muro que `enrich:specs`.
- **`active` no sirve para registrar salud:** el scraper lo reafirma a `true` cada pasada.

## Decisiones (acordadas con el usuario)

1. **Sistema recurrente** (no parche puntual): checker reutilizable + campo de salud + la app
   consume la salud.
2. **Comportamiento de la app:** un producto con enlace muerto **sale de la home**
   (Destacados/Novedades) pero **permanece en catálogo/búsqueda**; su ficha muestra precio e
   histórico **sin botón de compra** (degradación "Sin enlace afiliado", que ya existe).
3. **El checker manda solo** sobre la salud (columnas propias); el scraper no las toca.
4. **Mecanismo de detección: Playwright** (contexto fresco por URL, patrón `enrich:specs`),
   ejecutado **en local de forma manual** (las IP de datacenter de GitHub Actions están aún más
   bloqueadas).

## Modelo de datos

Migración `db/migrations/00NN_affiliate_link_health.sql` (NN = siguiente libre, ≥ 0041):

```sql
alter table public.affiliate_links add column unavailable_at timestamptz; -- null = vivo/sin verificar
alter table public.affiliate_links add column checked_at     timestamptz; -- última verificación
alter table public.affiliate_links add column last_status    int;         -- último código HTTP (diagnóstico)
create index if not exists affiliate_links_checked_at_idx
  on public.affiliate_links (checked_at nulls first) where active;
```

- `unavailable_at IS NULL` ⇒ se considera **vivo o aún sin verificar**. Las 4.672 filas
  existentes quedan intactas: nada se oculta hasta que el checker confirme un 410/404.
- No destructiva, reversible (`alter table … drop column`).
- Tras la migración: `npm run db:types` para regenerar `lib/supabase/database.types.ts`
  (nunca a mano).

## Componentes

### 1. Núcleo puro de clasificación — `lib/link-health.ts`

```ts
export type LinkHealth = 'dead' | 'alive' | 'inconclusive';

/**
 * Traduce un código HTTP a salud de enlace.
 * - 410/404 → 'dead'  (PcComponentes usa 410 Gone para productos retirados)
 * - 200     → 'alive'
 * - resto (0/timeout, 403 bloqueo, 5xx) → 'inconclusive' (no cambiar estado)
 */
export function classifyStatus(status: number): LinkHealth {
  if (status === 410 || status === 404) return 'dead';
  if (status === 200) return 'alive';
  return 'inconclusive';
}
```

Testeable de forma aislada (Vitest). Es la única lógica con ramas; la I/O queda fina alrededor.

### 2. Checker — `scripts/check-links.ts` (Playwright, manual)

**Responsabilidad:** probar URLs de afiliado y registrar su salud. No decide presentación.

Selección de candidatos (cliente admin de Supabase), por prioridad y con tope por pasada
(`--limit`, defecto 150) por el rate-limit:

1. Productos de la home: `laptops.featured_rank IS NOT NULL` o presentes en el conjunto de
   novedades (one-per-brand recientes). Máximo impacto.
2. Enlaces nunca verificados (`checked_at IS NULL`).
3. `checked_at` más antiguo (orden ascendente, `nulls first` ya incluye el caso 2).
4. Re-verificar los marcados muertos (`unavailable_at IS NOT NULL`) para permitir revivir.

Por cada URL:
- Abrir **contexto de navegador fresco** (patrón `enrich:specs`), `page.goto(url)`, leer el
  `status()` de la respuesta principal.
- `classifyStatus(status)`:
  - `'dead'`  → `update … set unavailable_at = coalesce(unavailable_at, now()), checked_at = now(), last_status = status`
  - `'alive'` → `update … set unavailable_at = null, checked_at = now(), last_status = 200` (revive)
  - `'inconclusive'` → `update … set checked_at = now(), last_status = status` (no toca `unavailable_at`)
- Secuencial, pausa ~3-5 s entre páginas. Log por línea (`✓/✗/?` + status + url).

Flags: `--limit N`, `--dry-run` (no escribe, solo reporta), `--home-only` (solo prioridad 1).
Script npm: `"check:links": "tsx scripts/check-links.ts"`.

**No** se añade a GitHub Actions (IP datacenter bloqueada). Documentado como ejecución manual,
igual que `enrich:specs`.

### 3. Consumo en la app

- **Ficha** `app/portatiles/[slug]/page.tsx` (líneas 143 y 149): añadir `.is('unavailable_at', null)`
  a las dos consultas de `affiliate_links`. Sin esto, un enlace muerto (que conserva `active=true`)
  pintaría un botón "Ver oferta" roto. Con el cambio: la fila degrada a "Sin enlace afiliado"
  (rama ya existente, línea 367-369), conservando precio e histórico.
- **RPCs `home_featured` y `home_novedades`**: migración que las redefine añadiendo el filtro
  ```sql
  and exists (
    select 1 from public.affiliate_links al
    where al.laptop_id = l.id and al.active and al.unavailable_at is null
  )
  ```
  para que los productos sin enlace vivo no aparezcan en los feeds. Se preservan el resto de
  filtros y el orden actuales de cada RPC (re-emitir la definición completa con `create or
  replace function`, `security invoker`, `stable`).
- **Catálogo / búsqueda (`search_laptops`)**: **sin cambios**. Los productos con enlace muerto
  permanecen; la ficha degrada.

### 4. Scraper

**Sin cambios.** El upsert de `affiliate_links` (`scrape-catalog.ts:588-601`) solo escribe
`url` y `active`; nunca toca `unavailable_at` / `checked_at` / `last_status`. Caveat aceptado
(YAGNI): si PcComponentes cambia el slug de un producto, `unavailable_at` queda obsoleto hasta
la siguiente pasada del checker, que re-verifica y revive si da 200 (autocuración).

## Flujo de datos

```
PcComponentes (storefront)            Supabase                         Next.js
        │  410/404/200                    │                               │
check-links.ts ──HTTP(Playwright)──> classifyStatus ──update affiliate_links──┐
                                          │ unavailable_at / checked_at        │
scrape-catalog.ts ──Algolia──> upsert url+active (no toca salud) ─────────────┤
                                          │                                    ▼
                          home_featured / home_novedades (excluyen muertos)  feeds home
                          ficha query (.is unavailable_at null) ──────────>  ficha degradada
```

## Errores

- Bloqueo / timeout / 5xx → `'inconclusive'`: nunca marca muerto por un fallo transitorio.
- 410 confirmado en una pasada ya marca muerto (PcComponentes usa 410 deliberadamente para
  retirados; no se exige doble confirmación). Si más adelante hay falsos positivos, se puede
  endurecer a "N fallos consecutivos" — fuera de alcance ahora (YAGNI).
- Migración nullable ⇒ estado inicial = todo vivo; ningún producto desaparece hasta verificar.

## Tests

- **Vitest:** `classifyStatus` (410→dead, 404→dead, 200→alive, 000/403/500→inconclusive).
- **Migración:** aplicar y comprobar columnas + índice; rows existentes con `unavailable_at` null.
- **RPCs:** verificación manual — marcar un enlace `unavailable_at=now()` y confirmar que su
  producto desaparece de `home_featured`/`home_novedades` y que la ficha deja de mostrar el botón.
- **e2e:** los tests actuales de home (cards visibles, tolerantes) deben seguir pasando.

## Fuera de alcance (YAGNI)

- Workflow de GitHub Actions para el checker (IP bloqueada; ejecución manual).
- Doble/triple confirmación antes de marcar muerto.
- Reset de salud en el scraper al cambiar el slug (autocuración por el checker basta).
- Soporte multi-retailer (hoy solo `pccomponentes`).
