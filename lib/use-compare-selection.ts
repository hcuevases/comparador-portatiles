'use client';

import { useCallback, useSyncExternalStore } from 'react';

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
