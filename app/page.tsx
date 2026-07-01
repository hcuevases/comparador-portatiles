import { ArrowRight, Sparkles } from 'lucide-react';
import Link from 'next/link';

import { DealsSection } from '@/components/deals-section';
import { FeaturedSection } from '@/components/featured-section';
import { HomeHero } from '@/components/home-hero';
import { NovedadesSection } from '@/components/novedades-section';

// Portada: hero + escaparate curado (Chollos/Destacados/Novedades) + CTA al catálogo
// completo. El catálogo con filtros/paginación vive en /catalogo (app/catalogo/page.tsx).
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;

  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-8">
      <HomeHero />

      {message && (
        <div className="mb-4 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-100">
          {message}
        </div>
      )}

      <DealsSection />

      <FeaturedSection />

      <NovedadesSection />

      <section className="mt-4 mb-10 overflow-hidden rounded-3xl border border-zinc-200 bg-gradient-to-br from-zinc-50 to-white p-8 text-center dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-950">
        <Sparkles className="mx-auto h-6 w-6 text-cyan-500" aria-hidden />
        <h2 className="mt-3 font-display text-2xl font-bold tracking-tight">
          Explora todo el catálogo
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
          Filtra por marca, precio, RAM, pantalla y más entre los +3.800 modelos, y marca 2-4 para
          compararlos lado a lado.
        </p>
        <Link
          href="/catalogo"
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-700"
        >
          Explorar el catálogo <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </section>
    </main>
  );
}
