'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef, useState } from 'react';

import { LaptopGrid } from '@/components/laptop-grid';
import type { RecomendadorUIMessage } from '@/lib/ai/agent';

// Persistimos la conversación en sessionStorage (por pestaña, nunca al servidor →
// efímero/GDPR). Así, al abrir una ficha recomendada y volver atrás, el historial y
// las demás recomendaciones siguen ahí. Se borra al cerrar la pestaña.
const STORAGE_KEY = 'asistente-ia:conversacion';

const SUGERENCIAS = [
  'Portátil para programar, ligero y menos de 1200€',
  'El mejor portátil gaming por menos de 1500€',
  'Algo barato para estudiar, buena batería',
  'Ultrabook con pantalla OLED para diseño',
];

export function ChatAssistant({ initialQuery }: { initialQuery?: string }) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const didInit = useRef(false);

  const { messages, sendMessage, setMessages, status, error } = useChat<RecomendadorUIMessage>({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
    onFinish: () => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }),
  });

  const busy = status === 'submitted' || status === 'streaming';

  // Al montar (una vez): si venimos del buscador de la home con ?q=, arrancamos una
  // conversación NUEVA con esa consulta y limpiamos ?q de la URL (para que volver atrás
  // no la reenvíe). Si no, restauramos la conversación previa (hidratación-segura).
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    const q = initialQuery?.trim();
    if (q) {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignoramos */
      }
      sendMessage({ text: q });
      try {
        window.history.replaceState(null, '', '/asistente');
      } catch {
        /* ignoramos */
      }
      return;
    }
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as RecomendadorUIMessage[];
        if (parsed.length > 0) setMessages(parsed);
      }
    } catch {
      /* sessionStorage no disponible o JSON corrupto: ignoramos */
    }
  }, [initialQuery, sendMessage, setMessages]);

  // Guardar en cada cambio.
  useEffect(() => {
    try {
      if (messages.length > 0) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      /* ignoramos */
    }
  }, [messages]);

  function clearChat() {
    setMessages([]);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignoramos */
    }
  }

  function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    sendMessage({ text: t });
    setInput('');
  }

  return (
    <div className="flex flex-col gap-4">
      {messages.length === 0 && (
        <div className="rounded-lg border border-dashed border-zinc-300 p-6 dark:border-zinc-700">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Cuéntame qué buscas (uso, presupuesto, lo que más te importa) y te recomiendo
            modelos reales del catálogo con su precio actual.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {SUGERENCIAS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {messages.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={clearChat}
            className="text-xs text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            Nueva conversación
          </button>
        </div>
      )}

      <ul className="space-y-4">
        {messages.map((m) => (
          <li key={m.id}>
            {m.role === 'user' ? (
              <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-blue-600 px-4 py-2 text-sm text-white">
                {m.parts.map((p, i) => (p.type === 'text' ? <span key={i}>{p.text}</span> : null))}
              </div>
            ) : (
              <div className="space-y-3">
                {m.parts.map((part, i) => {
                  if (part.type === 'text') {
                    return (
                      <div
                        key={i}
                        className="w-fit max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-zinc-100 px-4 py-2 text-sm text-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                      >
                        {part.text}
                      </div>
                    );
                  }
                  if (part.type === 'tool-buscarPortatiles') {
                    if (part.state === 'output-available' && part.output.laptops.length > 0) {
                      return <LaptopGrid key={i} laptops={part.output.laptops} />;
                    }
                    if (part.state === 'output-available') {
                      return (
                        <p key={i} className="text-xs text-zinc-500">
                          No encontré portátiles con esos criterios.
                        </p>
                      );
                    }
                    return (
                      <p key={i} className="text-xs text-zinc-500">
                        Buscando en el catálogo…
                      </p>
                    );
                  }
                  return null;
                })}
              </div>
            )}
          </li>
        ))}
      </ul>

      {busy && messages[messages.length - 1]?.role === 'user' && (
        <p className="text-xs text-zinc-500">Pensando…</p>
      )}

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
          Algo ha fallado. Puede ser el límite de mensajes; prueba de nuevo en un rato.
        </p>
      )}

      <div ref={bottomRef} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="sticky bottom-4 flex items-end gap-2 rounded-lg border border-zinc-200 bg-white p-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ej: portátil ligero para trabajar, menos de 1000€"
          className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          disabled={busy || input.trim() === ''}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
