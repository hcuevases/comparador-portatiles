export type LinkHealth = 'dead' | 'alive' | 'inconclusive';

// Reto de Cloudflare aún sin resolver (mismo vocabulario que scripts/enrich-specs.ts).
const CHALLENGE_RE = /un momento|just a moment|verifying you are human|attention required/i;
// Soft-404: PcComponentes a veces sirve 200 con este título cuando el producto no existe.
const NOT_FOUND_RE = /p[áa]gina no encontrada/i;

/**
 * Traduce la respuesta de una URL de afiliado a salud del enlace.
 * - 410/404, o 200 con título de "página no encontrada" → 'dead'
 * - reto de Cloudflare sin resolver → 'inconclusive' (no decidir)
 * - 200 con título normal → 'alive'
 * - cualquier otro código (0/timeout, 403 bloqueo, 5xx) → 'inconclusive'
 *
 * El orden importa: el soft-404 (200 + título) se decide antes que el 200 vivo,
 * y el reto se separa del 200 vivo para no marcar vivo un interstitial.
 */
export function classifyResponse(httpStatus: number, title: string): LinkHealth {
  if (httpStatus === 410 || httpStatus === 404) return 'dead';
  if (NOT_FOUND_RE.test(title)) return 'dead';
  if (CHALLENGE_RE.test(title)) return 'inconclusive';
  if (httpStatus === 200) return 'alive';
  return 'inconclusive';
}
