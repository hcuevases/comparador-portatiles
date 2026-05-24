import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center p-8">
      <p className="mb-6 text-sm">
        <Link
          href="/"
          className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          ← Volver al catálogo
        </Link>
      </p>
      {children}
    </main>
  );
}
