import Link from 'next/link';

/**
 * Paginación clásica anterior/siguiente + números, Server Component.
 *
 * Recibe la URL base (path actual sin query) y los searchParams actuales como
 * objeto. Compone los `href` manteniendo todos los filtros + cambiando `page`.
 *
 * Renderiza hasta 7 números (1 ... N-2 N-1 [N] N+1 N+2 ... TOTAL) para que la
 * lista no crezca sin límite con catálogos grandes.
 */
type Props = {
  currentPage: number;
  totalPages: number;
  basePath: string;
  searchParams: Record<string, string | undefined>;
};

export function Pagination({ currentPage, totalPages, basePath, searchParams }: Props) {
  if (totalPages <= 1) return null;

  function urlFor(page: number): string {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (k === 'page') continue;
      if (v) params.set(k, v);
    }
    if (page > 1) params.set('page', String(page));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  // Genera la lista de páginas visibles: 1, ..., currentPage±2, ..., totalPages
  const visible = visiblePages(currentPage, totalPages);

  const prevDisabled = currentPage <= 1;
  const nextDisabled = currentPage >= totalPages;

  return (
    <nav
      aria-label="Paginación"
      className="mt-8 flex items-center justify-center gap-1 text-sm"
    >
      <PaginationLink
        href={urlFor(currentPage - 1)}
        disabled={prevDisabled}
        ariaLabel="Página anterior"
      >
        ← Anterior
      </PaginationLink>

      {visible.map((p, idx) =>
        p === 'gap' ? (
          <span key={`gap-${idx}`} className="px-2 text-zinc-400">
            …
          </span>
        ) : (
          <PaginationLink
            key={p}
            href={urlFor(p)}
            active={p === currentPage}
            ariaLabel={`Página ${p}`}
          >
            {p}
          </PaginationLink>
        ),
      )}

      <PaginationLink
        href={urlFor(currentPage + 1)}
        disabled={nextDisabled}
        ariaLabel="Página siguiente"
      >
        Siguiente →
      </PaginationLink>
    </nav>
  );
}

function PaginationLink({
  href,
  children,
  active = false,
  disabled = false,
  ariaLabel,
}: {
  href: string;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  ariaLabel: string;
}) {
  const base = 'inline-flex min-w-9 items-center justify-center rounded-md border px-3 py-1.5';
  const styles = active
    ? 'border-blue-500 bg-blue-50 font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300'
    : disabled
      ? 'cursor-not-allowed border-zinc-200 text-zinc-300 dark:border-zinc-800 dark:text-zinc-700'
      : 'border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900';

  if (disabled) {
    return (
      <span aria-label={ariaLabel} aria-disabled className={`${base} ${styles}`}>
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      aria-current={active ? 'page' : undefined}
      className={`${base} ${styles}`}
    >
      {children}
    </Link>
  );
}

/**
 * Devuelve la lista de páginas a mostrar, con 'gap' como marcador de "…".
 * Muestra siempre la primera, la última, y un rango alrededor de la actual.
 */
function visiblePages(current: number, total: number): Array<number | 'gap'> {
  const window = 1; // páginas a cada lado de la actual
  const pages: Array<number | 'gap'> = [];

  const start = Math.max(2, current - window);
  const end = Math.min(total - 1, current + window);

  pages.push(1);
  if (start > 2) pages.push('gap');
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < total - 1) pages.push('gap');
  if (total > 1) pages.push(total);

  return pages;
}
