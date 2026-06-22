'use client';

import { useCallback, useSyncExternalStore } from 'react';

import { createClient } from '@/lib/supabase/client';

import { mergeSelectionIds } from './compare-merge';

// Selección de portátiles para comparar, persistida en localStorage y
// compartida entre todos los componentes que monten el hook (cards del grid,
// botón de la ficha, barra flotante global). Usamos un store a nivel de módulo
// + useSyncExternalStore en lugar de useState para que la selección sobreviva a
// la navegación entre páginas (Server Components no comparten estado de React).
//
// Guardamos el item completo (no solo el id) para que la "cesta" flotante pueda
// pintar miniatura y nombre sin tener que volver a consultar Supabase.

const STORAGE_KEY = 'compare-selection';
export const MAX_COMPARE = 4;

export type CompareItem = {
  id: string;
  brand: string;
  model: string;
  image_url: string | null;
};

// Referencia estable para el snapshot de servidor (evita bucles de render en
// useSyncExternalStore, que compara con Object.is).
const EMPTY: readonly CompareItem[] = [];

let selection: CompareItem[] = [];
let initialized = false;
const listeners = new Set<() => void>();

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

function read(): CompareItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x): CompareItem | null => {
        // Formato nuevo: objeto completo.
        if (x && typeof x === 'object' && typeof x.id === 'string') {
          return {
            id: x.id,
            brand: typeof x.brand === 'string' ? x.brand : '',
            model: typeof x.model === 'string' ? x.model : '',
            image_url: typeof x.image_url === 'string' ? x.image_url : null,
          };
        }
        // Formato viejo (solo ids como strings): se conserva el id; nombre e
        // imagen quedan vacíos hasta que el usuario re-seleccione la card.
        if (typeof x === 'string') return { id: x, brand: '', model: '', image_url: null };
        return null;
      })
      .filter((x): x is CompareItem => x !== null)
      .slice(0, MAX_COMPARE);
  } catch {
    return [];
  }
}

// Inicialización perezosa: solo leemos localStorage la primera vez que algún
// componente lee el snapshot o se suscribe (ya en el navegador).
function ensureInit() {
  if (!initialized) {
    selection = read();
    initialized = true;
  }
}

function emit() {
  for (const listener of listeners) listener();
}

function persist() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
  } catch {
    // localStorage lleno o bloqueado (modo privado): la selección sigue viva
    // en memoria durante la sesión, solo no persiste entre recargas.
  }
}

function setSelection(next: CompareItem[]) {
  selection = next;
  persist();
  emit();
  void pushToServer(next.map((i) => i.id));
}

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
    setSelection(merged); // actualiza store + localStorage y empuja al servidor
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

// Sincronización entre pestañas: el evento `storage` solo dispara en OTROS
// documentos del mismo origen, así que no entra en conflicto con emit() local.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      selection = read();
      emit();
    }
  });
}

function subscribe(callback: () => void): () => void {
  ensureInit();
  startSync();
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot(): CompareItem[] {
  ensureInit();
  return selection;
}

function getServerSnapshot(): readonly CompareItem[] {
  return EMPTY;
}

export function useCompareSelection() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback((item: CompareItem) => {
    ensureInit();
    if (selection.some((x) => x.id === item.id)) {
      setSelection(selection.filter((x) => x.id !== item.id));
    } else {
      if (selection.length >= MAX_COMPARE) return;
      setSelection([...selection, item]);
    }
  }, []);

  const remove = useCallback((id: string) => {
    ensureInit();
    setSelection(selection.filter((x) => x.id !== id));
  }, []);

  const clear = useCallback(() => setSelection([]), []);

  const ids = items.map((i) => i.id);
  const isFull = items.length >= MAX_COMPARE;

  return {
    items,
    ids,
    count: items.length,
    toggle,
    remove,
    clear,
    isSelected: (id: string) => items.some((i) => i.id === id),
    isFull,
    max: MAX_COMPARE,
  };
}
