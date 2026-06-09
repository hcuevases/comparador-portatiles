import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Rate-limit por IP para el chat IA (cada mensaje cuesta dinero). Upstash Redis
// serverless. Si las env no están configuradas todavía (dev / sin aprovisionar), NO
// limita: el chat funciona pero sin protección.
//
// Acepta los dos nombres habituales: los nativos de Upstash (UPSTASH_REDIS_REST_*) y
// los que pone la integración de Vercel Marketplace (KV_REST_API_*).
const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

const limiter =
  url && token
    ? new Ratelimit({
        redis: new Redis({ url, token }),
        // 15 mensajes por IP cada 10 minutos: permite una conversación real pero
        // corta bucles/abuso.
        limiter: Ratelimit.slidingWindow(15, '10 m'),
        prefix: 'ratelimit:chat',
        analytics: false,
      })
    : null;

export const ratelimitActive = limiter !== null;

export async function limitChat(ip: string): Promise<{ ok: boolean }> {
  if (!limiter) return { ok: true };
  const { success } = await limiter.limit(ip);
  return { ok: success };
}
