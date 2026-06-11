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
          className="animate-rise mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-cyan-300"
          style={{ animationDelay: '0ms' }}
        >
          <span aria-hidden>✦</span> Recomendador con IA sobre catálogo real
        </p>

        <h1
          className="animate-rise font-display text-2xl font-extrabold leading-tight tracking-tight sm:text-4xl"
          style={{ animationDelay: '80ms' }}
        >
          Encuentra tu portátil
          <span className="block bg-gradient-to-r from-cyan-300 via-cyan-200 to-emerald-300 bg-clip-text text-transparent">
            con inteligencia artificial
          </span>
        </h1>

        <p
          className="animate-rise mx-auto mt-3 max-w-xl text-sm text-zinc-300 sm:text-base"
          style={{ animationDelay: '160ms' }}
        >
          Busca por marca o modelo y filtra al instante, o describe lo que necesitas y deja
          que la IA te lo recomiende.
        </p>

        {/* Buscador único: filtra en vivo + lanza la IA */}
        <div
          className="animate-rise mx-auto mt-5 flex max-w-xl flex-col gap-2 sm:flex-row"
          style={{ animationDelay: '240ms' }}
        >
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                ask();
              }
            }}
            placeholder="ThinkPad… o dime qué buscas"
            aria-label="Busca un portátil o describe lo que necesitas"
            className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-zinc-400 backdrop-blur focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
          />
          <button
            type="button"
            onClick={() => ask()}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-zinc-950 shadow-lg shadow-cyan-500/20 transition-transform hover:scale-[1.02] active:scale-100"
          >
            <span aria-hidden>✨</span> Recomiéndame
          </button>
        </div>

        <div
          className="animate-rise mt-4 flex flex-wrap justify-center gap-2"
          style={{ animationDelay: '320ms' }}
        >
          {EJEMPLOS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => ask(e)}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300 transition-colors hover:border-cyan-400/40 hover:text-white"
            >
              {e}
            </button>
          ))}
        </div>

        <p
          className="animate-rise mt-5 text-xs text-zinc-400"
          style={{ animationDelay: '400ms' }}
        >
          +3.800 portátiles · precios reales · Acer · Lenovo · HP · MSI · ASUS · Apple
        </p>
      </div>
    </section>
  );
}
