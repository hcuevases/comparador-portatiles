// Mapeo puro de un item de PA-API a nuestra forma normalizada (MappedOffer) y selección
// del item correcto entre los resultados de una búsqueda. Sin red, sin estado →
// unit-testeable (ver map-item.test.ts).

import type { MappedOffer, PaapiItem } from './types';

/**
 * Convierte un item de PA-API en una oferta normalizada. Devuelve null si al item le
 * falta ASIN o DetailPageURL (sin ellos no podemos ni cachear ni enlazar). El precio
 * solo se considera si la oferta está en EUR (el marketplace .es lo está); en otro caso
 * priceEur queda null y el llamador NO inserta punto de precio, pero sí puede guardar el
 * enlace de afiliado.
 */
export function mapItem(item: PaapiItem): MappedOffer | null {
  const asin = item.ASIN;
  const url = item.DetailPageURL;
  if (!asin || !url) return null;

  const listing = item.Offers?.Listings?.[0];
  const amount = listing?.Price?.Amount;
  const currency = listing?.Price?.Currency ?? null;
  const priceEur = typeof amount === 'number' && Number.isFinite(amount) && currency === 'EUR' ? amount : null;

  const availType = listing?.Availability?.Type;
  const inStock = availType == null ? null : availType === 'Now';

  return { asin, priceEur, currency, url, inStock };
}

/**
 * Elige, entre los resultados de SearchItems, el item cuyo EAN coincide EXACTAMENTE con
 * el buscado. SearchItems busca por palabra clave (el EAN) y puede devolver accesorios o
 * variantes que no son el producto; casar el EAN evita asignar una oferta equivocada.
 * Si ningún item declara el EAN, devuelve null (preferimos no enlazar a enlazar mal).
 */
export function pickItemByEan(items: PaapiItem[], ean: string): PaapiItem | null {
  for (const item of items) {
    const eans = item.ItemInfo?.ExternalIds?.EANs?.DisplayValues ?? [];
    if (eans.includes(ean)) return item;
  }
  return null;
}
