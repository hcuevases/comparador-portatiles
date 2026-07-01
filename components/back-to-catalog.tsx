'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

const LINK_CLASS =
  'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100';

// Enlace "Volver al catálogo" que recuerda la página y los filtros de origen.
// El catálogo (/catalogo) codifica su query string actual en `?from=` al enlazar
// cada ficha; aquí lo leemos en cliente (para NO romper el prerender ISR de la
// ficha) y reconstruimos `/catalogo?<query>`. Sin `from`, vuelve al catálogo base.
export function BackToCatalog() {
  const params = useSearchParams();
  const from = params.get('from');
  const href = from ? `/catalogo?${from}` : '/catalogo';
  return (
    <Link href={href} className={LINK_CLASS}>
      ← Volver al catálogo
    </Link>
  );
}

// Fallback del Suspense boundary: el mismo enlace apuntando a la home base.
// Se renderiza en el HTML inicial mientras hidrata el componente real, así el
// resto de la ficha se sigue prerenderizando.
export function BackToCatalogFallback() {
  return (
    <Link href="/catalogo" className={LINK_CLASS}>
      ← Volver al catálogo
    </Link>
  );
}
