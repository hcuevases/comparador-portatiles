# Diseño: sincronizar la selección de comparar a Supabase

**Fecha:** 2026-06-21
**Estado:** aprobado (pendiente de revisión del spec por el usuario)

## Problema

La selección de "comparar" (el carrito de 2-4 portátiles que el usuario está
considerando) vive solo en `localStorage` (hook `useCompareSelection`, store de
módulo + `useSyncExternalStore`). No persiste entre dispositivos: un usuario logueado
que monta una selección en el portátil no la encuentra en el móvil. Queremos que, para
usuarios autenticados, la selección se sincronice con Supabase.

## Decisiones tomadas (brainstorming)

1. **Fusionar al login**: al iniciar sesión se combinan la selección local y la del
   servidor (sin duplicados, respetando el máximo de 4). No se pierde nada de ninguno
   de los dos lados.
2. **Modelo A**: una fila por usuario con `laptop_ids uuid[]` (refleja el patrón de
   `comparisons.laptop_ids`). Descartadas: tabla normalizada por (user, laptop) y
   reutilizar `comparisons` con un flag.
3. **Servidor guarda solo ids**; los datos de display (marca/modelo/imagen) se hidratan
   desde la tabla `laptops` al cargar (fuente única, siempre fresca).
4. **Al cerrar sesión** se conserva la selección local (no se vacía).
5. **Escritura inmediata** por cambio, sin debounce (son ≤4 ids).
6. Sin Supabase Realtime (sync en vivo entre dispositivos abiertos simultáneamente):
   YAGNI. Basta con sync al cargar + escritura al cambiar. Entre pestañas del mismo
   navegador ya sincroniza por el evento `storage`.

## Arquitectura

Anónimo: el hook funciona **exactamente como hoy** (store de módulo + `localStorage`).
Logueado: además, el store se refleja en el servidor (escritura al cambiar) y se
fusiona con el servidor al iniciar sesión.

### 1. Modelo de datos

Migración `db/migrations/0033_compare_selections.sql`:

```sql
create table if not exists public.compare_selections (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  laptop_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.compare_selections enable row level security;

-- Owner-only: cada usuario solo ve/escribe su fila.
create policy "compare_selections_select_own" on public.compare_selections
  for select using (auth.uid() = user_id);
create policy "compare_selections_insert_own" on public.compare_selections
  for insert with check (auth.uid() = user_id);
create policy "compare_selections_update_own" on public.compare_selections
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "compare_selections_delete_own" on public.compare_selections
  for delete using (auth.uid() = user_id);
```

- Una fila por usuario (PK = `user_id`) → escritura por `upsert(onConflict: user_id)`.
- `on delete cascade`: el borrado de cuenta (GDPR, `auth.admin.deleteUser`) elimina la
  selección automáticamente. No hay que tocar `app/cuenta/actions.ts`.
- No hay FK sobre los elementos del array (igual que `comparisons.laptop_ids`); ids
  obsoletos (laptop borrado) se ignoran al hidratar (no aparecen en la query a
  `laptops`), así que se purgan solos.
- Regenerar tipos: `npm run db:types`.

### 2. Lógica de fusión (pura, testeable)

Nueva función en el hook (o en `lib/`):

```ts
// Fusiona ids local + servidor: local primero, luego los del servidor que falten,
// sin duplicados, tope `max`.
export function mergeSelectionIds(localIds: string[], serverIds: string[], max: number): string[] {
  const out: string[] = [];
  for (const id of [...localIds, ...serverIds]) {
    if (!out.includes(id)) out.push(id);
    if (out.length >= max) break;
  }
  return out;
}
```

### 3. Hook `lib/use-compare-selection.ts`

Se mantiene todo lo actual (store de módulo, `localStorage`, `useSyncExternalStore`,
evento `storage`, API `toggle/remove/clear/isSelected/isFull`). Se añade:

- **Cliente browser singleton** (`createClient` de `@/lib/supabase/client`) a nivel de
  módulo, para auth + lectura/escritura de la selección.
- **Init de sync, una sola vez** (guardado con un flag de módulo `syncStarted`, porque
  el hook se monta en muchas cards): al primer montaje en navegador, lee la sesión y se
  suscribe a `supabase.auth.onAuthStateChange`.
  - **Sesión presente** (montaje logueado o evento `SIGNED_IN`): `syncFromServer()`:
    1. `select laptop_ids from compare_selections where user_id = me` (RLS).
    2. `merged = mergeSelectionIds(localIds, serverIds, MAX_COMPARE)`.
    3. Hidratar los ids de `merged` que no tengan ya `CompareItem` completo en el store,
       con `select id, brand, model, image_url from laptops where id in (...)`.
    4. `setSelection(mergedItems)` (actualiza store + localStorage + emite).
    5. `pushToServer(merged)` (upsert de los ids fusionados).
  - **`SIGNED_OUT`**: no se toca la selección local (se conserva).
- **Escritura al cambiar**: `setSelection()` (ya central, a nivel de módulo) hace, si
  hay sesión activa, `pushToServer(currentIds)` además de `persist()` a localStorage.
  `pushToServer` = `upsert({ user_id, laptop_ids, updated_at }, { onConflict: 'user_id' })`.

Como el store y `setSelection` ya son de módulo, las escrituras al cambiar ocurren una
sola vez por cambio (no por card). El init de sync se protege con el flag para no
dispararse una vez por card montada.

### 4. Manejo de errores

Todas las operaciones de servidor (select, upsert, hidratar, auth) van en `try/catch`
y son **no fatales**: si fallan, la selección sigue funcionando vía localStorage
(mismo criterio que el `persist()` actual, que ya traga errores de localStorage lleno).

### 5. Datos / flujo

```
Anónimo:    store  ⇄  localStorage                         (sin cambios)
Logueado:   store  ⇄  localStorage
            store  →  servidor (upsert al cambiar)
            servidor → store   (fusión al login/montaje, con hidratación)
```

## No-objetivos

- Sync en vivo entre dispositivos abiertos a la vez (Realtime).
- Cambiar el comportamiento anónimo o la API del hook.
- Sincronizar las **comparativas guardadas** (`comparisons`) — eso ya persiste; esto es
  solo el carrito efímero de "comparar".
- Debounce / batching de escrituras.

## Tests

- **Unit (vitest)** de `mergeSelectionIds`: dedup, orden (local primero), tope 4, casos
  con solapamiento parcial, listas vacías.
- Hidratación e I/O de servidor: verificación manual en local (login en dos navegadores
  / sesiones, comprobar que la selección se fusiona y persiste). No hay test DB en CI.
- Verificar que `npm run lint && npm run typecheck && npm test` quedan en verde.
