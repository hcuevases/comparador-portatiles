'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'cookie-consent';

// Aviso informativo de cookies. La app solo usa cookies estrictamente necesarias
// (sesión de Supabase) + localStorage funcional, así que no es un muro de
// consentimiento: informa y se descarta. Si algún día se añade analítica o
// publicidad, esto debe convertirse en consentimiento granular (aceptar/rechazar)
// que NO active esas cookies hasta el «aceptar».
//
// Estado vía useSyncExternalStore (no useEffect+setState, que el React Compiler
// rechaza). En SSR asumimos "aceptado" para no pintar el banner en el HTML; tras
// hidratar, getSnapshot lee localStorage y lo muestra si toca.

function subscribe(callback: () => void): () => void {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

function getSnapshot(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'accepted';
  } catch {
    // localStorage bloqueado (modo privado): no insistimos con el aviso.
    return true;
  }
}

function getServerSnapshot(): boolean {
  return true;
}

export function CookieBanner() {
  const accepted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (accepted) return null;

  function accept() {
    try {
      window.localStorage.setItem(STORAGE_KEY, 'accepted');
    } catch {
      // sin-op si no se puede persistir.
    }
    // El evento `storage` no dispara en la pestaña que hace el cambio: lo
    // emitimos a mano para que useSyncExternalStore relea el snapshot y oculte
    // el banner. Otros listeners filtran por su propia key, así que no colisiona.
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
  }

  return (
    <div
      role="dialog"
      aria-label="Aviso de cookies"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Usamos solo cookies necesarias para el inicio de sesión y almacenamiento local para
          recordar tu selección. No usamos analítica ni publicidad.{' '}
          <Link
            href="/privacidad"
            className="font-medium text-cyan-600 underline hover:text-cyan-700"
          >
            Más información
          </Link>
          .
        </p>
        <button
          type="button"
          onClick={accept}
          className="shrink-0 self-start rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 sm:self-auto"
        >
          Aceptar
        </button>
      </div>
    </div>
  );
}
