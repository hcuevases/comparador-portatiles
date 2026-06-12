import Link from 'next/link';

// Footer global. Mantiene un enlace permanente a la política de privacidad
// (accesible desde cualquier página, no solo desde el banner) y el aviso de
// afiliación.
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p>
          Comparador de portátiles · Algunos enlaces son de afiliación y podemos recibir una
          comisión.
        </p>
        <Link href="/privacidad" className="hover:text-zinc-900 dark:hover:text-zinc-100">
          Privacidad y cookies
        </Link>
      </div>
    </footer>
  );
}
