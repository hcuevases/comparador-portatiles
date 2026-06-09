import { ChatAssistant } from '@/components/chat-assistant';

export const metadata = {
  title: 'Asistente IA — Comparador de portátiles',
  description:
    'Dinos qué buscas en lenguaje natural y te recomendamos portátiles reales del catálogo con su precio actual.',
};

export default async function AsistentePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  // `?q=` viene del buscador de la home: se auto-envía como primer mensaje.
  const { q } = await searchParams;
  return (
    <main className="mx-auto flex min-h-[80vh] max-w-3xl flex-col p-6 sm:p-8">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          <span aria-hidden>✨</span> Asistente IA
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Describe lo que necesitas y te recomiendo portátiles reales del catálogo, con su
          precio actual y enlace a la ficha.
        </p>
        <p className="mt-1 text-xs text-zinc-400">
          Tus mensajes se procesan con Google Gemini solo para responderte; no se guardan.
        </p>
      </header>

      <ChatAssistant initialQuery={q} />
    </main>
  );
}
