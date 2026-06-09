import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Rate-limit por IP para el chat IA (cada mensaje cuesta dinero). Upstash Redis
// serverless (aprobado en el stack). Si las env no están configuradas todavía
// (dev / sin aprovisionar), NO limita: el chat funciona pero sin protección.
// Para activarlo: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.
const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

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
