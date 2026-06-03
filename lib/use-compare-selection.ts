'use client';

import { useCallback, useSyncExternalStore } from 'react';

// Selección de portátiles para comparar, persistida en localStorage y
// compartida entre todos los componentes que monten el hook (cards del grid,
// botón de la ficha, barra flotante global). Usamos un store a nivel de módulo
// + useSyncExternalStore en lugar de useState para que la selección sobreviva a
// la navegación entre páginas (Server Components no comparten estado de React).

const STORAGE_KEY = 'compare-selection';
export const MAX_COMPARE = 4;

// Referencia estable para el snapshot de servidor (evita bucles de render en
// useSyncExternalStore, que compara con Object.is).
const EMPTY: readonly string[] = [];

let selection: string[] = [];
let initialized = false;
const listeners = new Set<() => void>();

function read(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string').slice(0, MAX_COMPARE);
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

function setSelection(next: string[]) {
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

function getSnapshot(): string[] {
  ensureInit();
  return selection;
}

function getServerSnapshot(): readonly string[] {
  return EMPTY;
}

export function useCompareSelection() {
  const ids = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback((id: string) => {
    ensureInit();
    if (selection.includes(id)) {
      setSelection(selection.filter((x) => x !== id));
    } else {
      if (selection.length >= MAX_COMPARE) return;
      setSelection([...selection, id]);
    }
  }, []);

  const clear = useCallback(() => setSelection([]), []);

  const isFull = ids.length >= MAX_COMPARE;

  return {
    ids,
    count: ids.length,
    toggle,
    clear,
    isSelected: (id: string) => ids.includes(id),
    isFull,
    max: MAX_COMPARE,
  };
}
