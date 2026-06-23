# Sincronizar la selección de comparar a Supabase — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la selección de "comparar" (carrito de ≤4 portátiles) persista en Supabase para usuarios logueados y se sincronice entre dispositivos, fusionando local + servidor al iniciar sesión.

**Architecture:** Tabla `compare_selections` (una fila por usuario, `laptop_ids uuid[]`, RLS owner-only). El hook `useCompareSelection` (store de módulo + localStorage) gana una capa de sync: al detectar sesión fusiona servidor+local (dedup, tope 4, hidratando display desde `laptops`) y, en cada cambio, hace upsert de los ids. Anónimo: sin cambios.

**Tech Stack:** Next.js 16 (App Router, client components), Supabase (Postgres + RLS + Auth) vía `@supabase/ssr` browser client, TypeScript estricto, Vitest. Migraciones aplicadas vía Supabase Management API; tipos con `npm run db:types`.

**Convenciones del repo:**
- Rama ya creada: `feat/sync-compare-selection`. No commits a `main`.
- No `prettier --write` (CRLF; ensucia el diff). Verificar con `npm run lint && npm run typecheck && npm test`.
- Conventional Commits en español, terminando con `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Migraciones idempotentes (`if not exists`, `create policy` es idempotente solo si se hace `drop policy if exists` antes — ver Task 1).
- Helper de shell para aplicar SQL (PAT en `.env.local`):

```bash
applysql() {
  local FILE="$1"
  local PAT=$(grep -E '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2- | tr -d '\r"')
  local SQL=$(cat "$FILE")
  local PAYLOAD=$(SQL="$SQL" node -e 'process.stdout.write(JSON.stringify({query:process.env.SQL}))')
  curl -s -X POST "https://api.supabase.com/v1/projects/uhnbfyjapxbmifyeacly/database/query" \
    -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" -d "$PAYLOAD"; echo
}
runsql() {
  local PAT=$(grep -E '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2- | tr -d '\r"')
  local PAYLOAD=$(SQL="$1" node -e 'process.stdout.write(JSON.stringify({query:process.env.SQL}))')
  curl -s -X POST "https://api.supabase.com/v1/projects/uhnbfyjapxbmifyeacly/database/query" \
    -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" -d "$PAYLOAD"; echo
}
```
Una DDL correcta devuelve `[]`; un error devuelve JSON con `message`.

---

## Estructura de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `db/migrations/0033_compare_selections.sql` | Crear | Tabla `compare_selections` + RLS owner-only |
| `lib/supabase/database.types.ts` | Regenerar | Tipos de la tabla nueva |
| `lib/compare-merge.ts` | Crear | `mergeSelectionIds` (función pura) |
| `lib/compare-merge.test.ts` | Crear | Tests unitarios de la fusión |
| `lib/use-compare-selection.ts` | Modificar | Capa de sync con Supabase (singleton, auth, push, syncFromServer) |

---

## Task 1: Migración 0033 — tabla `compare_selections` + RLS

**Files:**
- Create: `db/migrations/0033_compare_selections.sql`

- [ ] **Step 1: Escribir la migración**

Crear `db/migrations/0033_compare_selections.sql`:

```sql
-- 0033_compare_selections.sql
-- Sincroniza la selección de "comparar" (carrito efímero de ≤4 portátiles) entre
-- dispositivos para usuarios logueados. Una fila por usuario; el carrito anónimo sigue
-- viviendo solo en localStorage (cliente). RLS dueño-only (mismo patrón que comparisons
-- / price_alerts). Cascade on delete desde auth.users: borrar la cuenta (GDPR) elimina
-- la selección. Se guardan solo ids; el display (marca/modelo/imagen) se hidrata desde
-- `laptops` en cliente.

create table if not exists public.compare_selections (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  laptop_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.compare_selections enable row level security;

drop policy if exists "owner reads own compare selection" on public.compare_selections;
create policy "owner reads own compare selection"
  on public.compare_selections for select
  using (auth.uid() = user_id);

drop policy if exists "owner writes own compare selection" on public.compare_selections;
create policy "owner writes own compare selection"
  on public.compare_selections for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

- [ ] **Step 2: Aplicar la migración**

Run: `applysql db/migrations/0033_compare_selections.sql`
Expected: `[]` (sin error).

- [ ] **Step 3: Verificar tabla + RLS + políticas**

Run:
```bash
runsql "select
  (select count(*) from information_schema.tables where table_name='compare_selections') as tabla,
  (select relrowsecurity from pg_class where relname='compare_selections') as rls,
  (select count(*) from pg_policies where tablename='compare_selections') as politicas;"
```
Expected: `tabla=1`, `rls=true`, `politicas=2`.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/0033_compare_selections.sql
git commit -m "feat(db): tabla compare_selections (sync del carrito de comparar, RLS owner-only)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Regenerar tipos de Supabase

**Files:**
- Modify (regenerado): `lib/supabase/database.types.ts`

- [ ] **Step 1: Regenerar**

Run: `npm run db:types`
Expected: el archivo se reescribe sin error.

- [ ] **Step 2: Verificar que el tipo de la tabla aparece**

Buscar `compare_selections` en `lib/supabase/database.types.ts` (grep). Debe aparecer con `Row`/`Insert`/`Update` incluyendo `user_id`, `laptop_ids`, `updated_at`. Si no aparece, la regeneración no cogió la tabla — investigar antes de seguir.

- [ ] **Step 3: Typecheck (debe seguir verde)**

Run: `npm run typecheck`
Expected: sin errores (nada consume aún la tabla).

- [ ] **Step 4: Commit**

```bash
git add lib/supabase/database.types.ts
git commit -m "chore(db): regenera tipos tras compare_selections

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Función pura de fusión (TDD)

**Files:**
- Create: `lib/compare-merge.ts`
- Test: `lib/compare-merge.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/compare-merge.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { mergeSelectionIds } from './compare-merge';

describe('mergeSelectionIds', () => {
  it('local primero, luego los del servidor que faltan', () => {
    expect(mergeSelectionIds(['a', 'b'], ['c', 'd'], 4)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('deduplica conservando la primera aparición (local)', () => {
    expect(mergeSelectionIds(['a', 'b'], ['b', 'c'], 4)).toEqual(['a', 'b', 'c']);
  });

  it('respeta el tope', () => {
    expect(mergeSelectionIds(['a', 'b', 'c'], ['d', 'e'], 4)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('listas vacías', () => {
    expect(mergeSelectionIds([], [], 4)).toEqual([]);
    expect(mergeSelectionIds([], ['a'], 4)).toEqual(['a']);
    expect(mergeSelectionIds(['a'], [], 4)).toEqual(['a']);
  });

  it('local ya en el tope ignora el servidor', () => {
    expect(mergeSelectionIds(['a', 'b', 'c', 'd'], ['e'], 4)).toEqual(['a', 'b', 'c', 'd']);
  });
});
```

- [ ] **Step 2: Ejecutar el test para verle fallar**

Run: `npx vitest run lib/compare-merge.test.ts`
Expected: FAIL ("Cannot find module './compare-merge'").

- [ ] **Step 3: Implementar**

Crear `lib/compare-merge.ts`:

```ts
// Fusiona los ids de selección local (este navegador) y de servidor (otro dispositivo):
// local primero, luego los del servidor que falten, sin duplicados, con tope `max`.
// Pura y testeable; la usa el hook al iniciar sesión.
export function mergeSelectionIds(localIds: string[], serverIds: string[], max: number): string[] {
  const out: string[] = [];
  for (const id of [...localIds, ...serverIds]) {
    if (out.length >= max) break;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}
```

- [ ] **Step 4: Ejecutar tests hasta verde**

Run: `npx vitest run lib/compare-merge.test.ts`
Expected: PASS (5 tests). Luego `npm run lint && npm run typecheck` limpios para los archivos nuevos.

- [ ] **Step 5: Commit**

```bash
git add lib/compare-merge.ts lib/compare-merge.test.ts
git commit -m "feat: mergeSelectionIds — fusión pura de selección local + servidor

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Capa de sync en `useCompareSelection`

**Files:**
- Modify: `lib/use-compare-selection.ts`

El hook actual (módulo): store `selection: CompareItem[]`, `initialized`, `listeners`,
`read()`, `ensureInit()`, `emit()`, `persist()`, `setSelection(next)`, listener de
`storage`, `subscribe/getSnapshot/getServerSnapshot`, y `useCompareSelection()`.

Se añade una capa de sync **a nivel de módulo** (no por componente). Los cambios concretos:

- [ ] **Step 1: Añadir imports**

Al principio de `lib/use-compare-selection.ts`, tras los imports existentes (debajo de
`import { useCallback, useSyncExternalStore } from 'react';`), añadir:

```ts
import { createClient } from '@/lib/supabase/client';

import { mergeSelectionIds } from './compare-merge';
```

- [ ] **Step 2: Añadir el cliente singleton y el estado de sesión**

Justo después de la línea `const listeners = new Set<() => void>();`, añadir:

```ts
// --- Sincronización con Supabase (solo usuarios logueados) ---
// Cliente browser singleton (lazy, solo en navegador) para auth + lectura/escritura.
let supabase: ReturnType<typeof createClient> | null = null;
function db(): ReturnType<typeof createClient> {
  if (!supabase) supabase = createClient();
  return supabase;
}

// Usuario actual (null = anónimo) y guarda para arrancar la sync una sola vez,
// aunque el hook se monte en muchas cards.
let userId: string | null = null;
let syncStarted = false;
```

- [ ] **Step 3: Añadir las funciones de sync**

Justo después de `setSelection` (la función existente `function setSelection(next: CompareItem[]) { ... }`), añadir estas funciones:

```ts
// Sube los ids actuales al servidor (no-op si anónimo). No fatal.
async function pushToServer(ids: string[]): Promise<void> {
  if (typeof window === 'undefined' || !userId) return;
  try {
    await db()
      .from('compare_selections')
      .upsert({ user_id: userId, laptop_ids: ids, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  } catch {
    // No fatal: la selección sigue viva en localStorage.
  }
}

// Trae la selección del servidor, la fusiona con la local, hidrata el display que falte
// desde `laptops` y persiste el resultado (store + localStorage + servidor). No fatal.
async function syncFromServer(): Promise<void> {
  if (!userId) return;
  try {
    const { data } = await db()
      .from('compare_selections')
      .select('laptop_ids')
      .eq('user_id', userId)
      .maybeSingle();
    const serverIds: string[] = data?.laptop_ids ?? [];

    ensureInit();
    const localIds = selection.map((i) => i.id);
    const mergedIds = mergeSelectionIds(localIds, serverIds, MAX_COMPARE);

    // Datos de display que ya tenemos en el store (de localStorage).
    const have = new Map(selection.map((i) => [i.id, i] as const));
    const missing = mergedIds.filter((id) => !have.has(id));

    if (missing.length > 0) {
      const { data: rows } = await db()
        .from('laptops')
        .select('id, brand, model, image_url')
        .in('id', missing)
        .returns<{ id: string; brand: string; model: string; image_url: string | null }[]>();
      for (const r of rows ?? []) {
        have.set(r.id, { id: r.id, brand: r.brand, model: r.model, image_url: r.image_url });
      }
    }

    // Reconstruye en el orden fusionado; descarta ids sin datos (laptop borrada).
    const merged = mergedIds.map((id) => have.get(id)).filter((x): x is CompareItem => x !== undefined);
    setSelection(merged); // actualiza store + localStorage y empuja al servidor (Step 4)
  } catch {
    // No fatal.
  }
}

// Arranca la sync una sola vez (en navegador). Escucha cambios de sesión: al iniciar
// sesión (o si ya hay sesión al montar) fusiona; al cerrar sesión conserva lo local.
function startSync(): void {
  if (syncStarted || typeof window === 'undefined') return;
  syncStarted = true;
  db().auth.onAuthStateChange((event, session) => {
    const newId = session?.user?.id ?? null;
    if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
      userId = newId;
      if (userId) void syncFromServer();
    } else if (event === 'SIGNED_OUT') {
      userId = null; // conservar la selección local
    } else {
      userId = newId; // TOKEN_REFRESHED / USER_UPDATED: mantener id fresco, sin re-fusionar
    }
  });
}
```

- [ ] **Step 4: Que `setSelection` empuje al servidor**

Reemplazar la función `setSelection` existente:

```ts
function setSelection(next: CompareItem[]) {
  selection = next;
  persist();
  emit();
}
```

por:

```ts
function setSelection(next: CompareItem[]) {
  selection = next;
  persist();
  emit();
  void pushToServer(next.map((i) => i.id));
}
```

(`pushToServer` es no-op si el usuario es anónimo, así que el camino anónimo no cambia.)

- [ ] **Step 5: Arrancar la sync desde `subscribe`**

En la función `subscribe` existente:

```ts
function subscribe(callback: () => void): () => void {
  ensureInit();
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}
```

añadir la llamada a `startSync()` tras `ensureInit()`:

```ts
function subscribe(callback: () => void): () => void {
  ensureInit();
  startSync();
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}
```

(`subscribe` lo llama `useSyncExternalStore` en un efecto, en cliente — buen punto para
el side-effect. `startSync` está guardado, así que solo actúa una vez.)

- [ ] **Step 6: Verificar typecheck + lint + tests**

Run: `npm run typecheck && npm run lint && npm test`
Expected: todo verde (89 tests existentes + 5 nuevos de `compare-merge`). Si `typecheck`
falla en `db()` por el tipo del cliente, confirmar que `createClient` está importado de
`@/lib/supabase/client` y que la tabla está en los tipos regenerados (Task 2).

- [ ] **Step 7: Commit**

```bash
git add lib/use-compare-selection.ts
git commit -m "feat: sincroniza la selección de comparar a Supabase para usuarios logueados

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Verificación manual y cierre

**Files:** (ninguno — verificación)

- [ ] **Step 1: Arrancar dev**

Run: `npm run dev` → abrir `http://localhost:3000`.

- [ ] **Step 2: Comprobar el camino anónimo (sin regresión)**

Sin loguear: marcar 2-3 portátiles → la barra flotante aparece y persiste al navegar y
al recargar (localStorage). Igual que antes.

- [ ] **Step 3: Comprobar la sync logueado**

- Loguear (`/login`). Marcar 2 portátiles. En la BD debe aparecer la fila:
  ```bash
  runsql "select user_id, array_length(laptop_ids,1) n, laptop_ids from public.compare_selections;"
  ```
  Expected: una fila con `n=2`.
- En otra sesión/navegador con el mismo usuario (o borrando localStorage y recargando
  logueado): la selección aparece (hidratada con nombre/imagen).
- Marcar otra en el 2º navegador y volver al 1º logueando de nuevo → se **fusionan**
  (sin duplicados, tope 4).
- Cerrar sesión → la selección local se conserva (no se vacía).

- [ ] **Step 4: Calidad final (lo que corre CI)**

Run: `npm run lint && npm run typecheck && npm test`
Expected: todo verde.

- [ ] **Step 5: PR**

```bash
git push -u origin feat/sync-compare-selection
gh pr create --fill
```
Esperar CI verde. Mergear con `gh pr merge --squash --delete-branch` y `git checkout main && git pull`.

---

## Notas post-merge (fuera del plan)

- Documentar en el vault: nota técnica `33-sync-seleccion-comparar.md` + entrada de bitácora + índice + ADR si procede.
- No cambia el borrado de cuenta: el `on delete cascade` ya limpia la selección (GDPR).
