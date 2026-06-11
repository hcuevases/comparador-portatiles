'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

const EJEMPLOS = [
  'gaming por menos de 1500€',
  'ligero para programar, buena pantalla',
  'barato para estudiar con buena batería',
];

const DEBOUNCE_MS = 300;

// Único buscador del sitio: filtra el catálogo en vivo (?q=) por marca/modelo Y, con
// "✨ Recomiéndame", lleva la consulta al asistente IA (que entiende lenguaje natural).
export function HomeHero() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [q, setQ] = useState(searchParams.get('q') ?? '');

  // Debounce del filtro en vivo hacia la URL (igual patrón que los filtros).
  useEffect(() => {
    const t = setTimeout(() => {
      if (q !== (searchParams.get('q') ?? '')) {
        const params = new URLSearchParams(searchParams.toString());
        if (q) params.set('q', q);
        else params.delete('q');
        params.delete('page');
        const next = params.toString();
        startTransition(() => {
          router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
        });
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function ask(text?: string) {
    const t = (text ?? q).trim();
    router.push(t ? `/asistente?q=${encodeURIComponent(t)}` : '/asistente');
  }

  return (
    <section className="hero-mesh hero-grain relative mb-6 overflow-hidden rounded-3xl border border-white/10 px-6 py-8 text-white sm:px-10 sm:py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[36rem] -translate-x-1/2 rounded-full bg-cyan-400/20 blur-3xl"
      />

      <div className="relative mx-auto max-w-2xl text-center">
        <p
          className="animate-rise mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-cyan-300"
          style={{ animationDelay: '0ms' }}
        >
          <span aria-hidden>✦</span> Recomendador con IA · catálogo real
        </p>

        <h1
          className="animate-rise font-display text-xl font-extrabold leading-tight tracking-tight sm:text-3xl"
          style={{ animationDelay: '80ms' }}
        >
          Tu próximo portátil, elegido{' '}
          <span className="whitespace-nowrap bg-gradient-to-r from-cyan-300 via-cyan-200 to-emerald-300 bg-clip-text text-transparent">
            con IA
          </span>
        </h1>

        <p
          className="animate-rise mx-auto mt-2 max-w-md text-sm text-zinc-300"
          style={{ animationDelay: '160ms' }}
        >
          Búscalo por marca o modelo, o cuéntale a la IA qué necesitas.
        </p>

        {/* Command bar: el buscador es la estrella. Icono + input + acción en una
            sola pieza unificada tipo Spotlight. Filtra en vivo (?q=) + lanza la IA. */}
        <div
          className="animate-rise mx-auto mt-6 flex max-w-xl items-center gap-1.5 rounded-2xl border border-white/15 bg-white/10 p-1.5 pl-3 shadow-2xl shadow-cyan-500/10 ring-1 ring-white/10 backdrop-blur transition-colors sm:gap-2 sm:pl-4 focus-within:border-cyan-400/60 focus-within:ring-cyan-400/30"
          style={{ animationDelay: '240ms' }}
        >
          <span aria-hidden className="shrink-0 text-lg text-cyan-300">
            ✨
          </span>
          <input
            type="search"
            size={1}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                ask();
              }
            }}
            placeholder="busca o dime qué necesitas…"
            aria-label="Busca un portátil o describe lo que necesitas"
            className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-white placeholder:text-zinc-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => ask()}
            className="shrink-0 rounded-xl bg-cyan-400 px-3.5 py-2.5 text-sm font-semibold text-zinc-950 shadow-lg shadow-cyan-500/20 transition-transform hover:scale-[1.02] active:scale-100 sm:px-4"
          >
            Recomiéndame
          </button>
        </div>

        <div
          className="animate-rise mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-xs"
          style={{ animationDelay: '320ms' }}
        >
          <span className="text-zinc-500">Prueba:</span>
          {EJEMPLOS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => ask(e)}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-zinc-300 transition-colors hover:border-cyan-400/40 hover:text-white"
            >
              {e}
            </button>
          ))}
        </div>

        <div
          className="animate-rise mt-5 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-[11px] text-zinc-400"
          style={{ animationDelay: '400ms' }}
        >
          {['+3.800 modelos', 'precios reales', 'Acer · Lenovo · HP · MSI · ASUS · Apple'].map(
            (s, i) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                {i > 0 && <span aria-hidden className="text-zinc-600">·</span>}
                {s}
              </span>
            ),
          )}
        </div>
      </div>
    </section>
  );
}
