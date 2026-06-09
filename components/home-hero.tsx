'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const EJEMPLOS = [
  'gaming por menos de 1500€',
  'ligero para programar, buena pantalla',
  'barato para estudiar con buena batería',
];

export function HomeHero() {
  const router = useRouter();
  const [q, setQ] = useState('');

  function ask(text?: string) {
    const t = (text ?? q).trim();
    router.push(t ? `/asistente?q=${encodeURIComponent(t)}` : '/asistente');
  }

  return (
    <section className="hero-mesh hero-grain relative mb-8 overflow-hidden rounded-3xl border border-white/10 px-6 py-12 text-white sm:px-10 sm:py-16">
      {/* halo superior */}
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
          className="animate-rise font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl"
          style={{ animationDelay: '80ms' }}
        >
          Encuentra tu portátil
          <span className="block bg-gradient-to-r from-cyan-300 via-cyan-200 to-emerald-300 bg-clip-text text-transparent">
            con inteligencia artificial
          </span>
        </h1>

        <p
          className="animate-rise mx-auto mt-5 max-w-xl text-base text-zinc-300 sm:text-lg"
          style={{ animationDelay: '160ms' }}
        >
          Descríbelo en una frase y te recomiendo modelos reales del catálogo, con su precio
          actual y enlace a la ficha.
        </p>

        {/* Buscador IA */}
        <div
          className="animate-rise mx-auto mt-7 flex max-w-xl flex-col gap-2 sm:flex-row"
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
            placeholder="Dime qué buscas…"
            aria-label="Describe el portátil que buscas"
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

        {/* Ejemplos rápidos */}
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
          className="animate-rise mt-7 text-xs text-zinc-400"
          style={{ animationDelay: '400ms' }}
        >
          +3.800 portátiles · precios reales · Acer · Lenovo · HP · MSI · ASUS · Apple
        </p>
      </div>
    </section>
  );
}
