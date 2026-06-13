// Mapeo puro de un producto de Tradedoubler a la oferta normalizada (RetailerOffer) y
// selección del producto cuyo EAN coincide. Sin red ni estado → unit-testeable.

import type { RetailerOffer } from '@/lib/connectors/upsert-offer';

import type { TdProduct } from './types';

// Parsea un precio que puede venir como número o string ("1199.00" o "1.199,00").
export function parsePrice(value: string | number | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  let s = value.trim();
  // Si hay coma y no hay punto, la coma es el decimal ("1199,00"); si hay ambos, el punto
  // es separador de millares ("1.199,00") → quitar puntos y pasar coma a punto.
  if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.');
  else if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  const cleaned = s.replace(/[^\d.]/g, '');
  const n = Number(cleaned);
  return cleaned !== '' && Number.isFinite(n) && n > 0 ? n : null;
}

function availabilityToStock(av: string | undefined): boolean | null {
  if (!av) return null;
  if (/in\s*stock|disponible|en\s*stock/i.test(av)) return true;
  if (/out\s*of\s*stock|agotado|no\s*disponible/i.test(av)) return false;
  return null;
}

export function mapProduct(p: TdProduct): RetailerOffer | null {
  const url = p.productUrl; // el enlace trackeado es el de afiliado
  if (!url) return null;
  const amount = parsePrice(p.price?.value);
  const priceEur = amount != null && p.price?.currency === 'EUR' ? amount : null;
  return { url, priceEur, inStock: availabilityToStock(p.availability) };
}

/**
 * Elige el producto cuyo EAN coincide. La query a Tradedoubler ya filtra por `;ean=`, pero
 * verificamos por si devuelve variantes. Si ningún producto declara EAN (el campo puede no
 * venir), confiamos en el filtro del servidor y tomamos el primero.
 */
export function pickByEan(products: TdProduct[], ean: string): TdProduct | null {
  const exact = products.find((p) => p.identifiers?.ean === ean);
  if (exact) return exact;
  const anyDeclaresEan = products.some((p) => p.identifiers?.ean);
  return anyDeclaresEan ? null : (products[0] ?? null);
}
