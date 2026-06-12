'use client';

import { Bell, Check } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { createPriceAlert, deletePriceAlert } from '@/app/portatiles/[slug]/actions';
import { createClient } from '@/lib/supabase/client';

// Botón de la ficha para suscribirse a alertas de bajada de precio. La ficha es
// ISR/estática, así que el estado per-usuario se resuelve en cliente: al montar,
// comprueba sesión + si ya hay alerta para este portátil (la RLS limita la query
// a las del usuario). El setState va dentro de un callback async (no síncrono en
// el efecto), que el React Compiler permite.
type Status = 'loading' | 'anon' | 'inactive' | 'active';

export function PriceAlertButton({ laptopId }: { laptopId: string }) {
  const [status, setStatus] = useState<Status>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setStatus('anon');
        return;
      }
      const { data } = await supabase
        .from('price_alerts')
        .select('id')
        .eq('laptop_id', laptopId)
        .maybeSingle();
      if (!cancelled) setStatus(data ? 'active' : 'inactive');
    })();
    return () => {
      cancelled = true;
    };
  }, [laptopId]);

  async function subscribe() {
    setBusy(true);
    setError(null);
    const res = await createPriceAlert(laptopId);
    setBusy(false);
    if (res.ok) setStatus('active');
    else setError(res.error ?? 'No se pudo crear la alerta.');
  }

  async function unsubscribe() {
    setBusy(true);
    setError(null);
    const res = await deletePriceAlert(laptopId);
    setBusy(false);
    if (res.ok) setStatus('inactive');
    else setError(res.error ?? 'No se pudo quitar la alerta.');
  }

  const baseClass =
    'inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors';

  return (
    <div>
      {status === 'loading' && (
        <span className={`${baseClass} border-zinc-200 text-zinc-400 dark:border-zinc-800`}>
          <Bell className="h-4 w-4" aria-hidden /> Avísame si baja de precio
        </span>
      )}

      {status === 'anon' && (
        <Link
          href="/login"
          className={`${baseClass} border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900`}
        >
          <Bell className="h-4 w-4" aria-hidden /> Inicia sesión para crear una alerta de precio
        </Link>
      )}

      {status === 'inactive' && (
        <button
          type="button"
          onClick={subscribe}
          disabled={busy}
          className={`${baseClass} border-zinc-300 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900`}
        >
          <Bell className="h-4 w-4" aria-hidden /> Avísame si baja de precio
        </button>
      )}

      {status === 'active' && (
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`${baseClass} border-green-500 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300`}
          >
            <Check className="h-4 w-4" aria-hidden /> Alerta de precio activa
          </span>
          <button
            type="button"
            onClick={unsubscribe}
            disabled={busy}
            className="text-xs text-zinc-500 underline hover:text-zinc-900 disabled:opacity-50 dark:hover:text-zinc-100"
          >
            quitar
          </button>
        </div>
      )}

      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
