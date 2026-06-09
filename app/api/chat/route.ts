import { createAgentUIStreamResponse } from 'ai';

import { recomendadorAgent } from '@/lib/ai/agent';
import { limitChat } from '@/lib/ratelimit';

// El recomendador conversacional. Streaming vía AI SDK + Vercel AI Gateway.
// Corre como Vercel Function (Node, región EU como el resto del proyecto).
export const maxDuration = 60;

export async function POST(request: Request) {
  const ip =
    (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'anon';

  const { ok } = await limitChat(ip);
  if (!ok) {
    return new Response(
      'Has alcanzado el límite de mensajes por ahora. Prueba de nuevo en unos minutos.',
      { status: 429 },
    );
  }

  const { messages } = await request.json();
  return createAgentUIStreamResponse({ agent: recomendadorAgent, uiMessages: messages });
}
