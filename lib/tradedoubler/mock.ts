// Respuesta de Tradedoubler simulada para el modo --mock del conector de MediaMarkt.

import type { TdProductsResponse } from './types';

export function mockProductsResponse(ean: string): TdProductsResponse {
  return {
    products: [
      {
        name: 'Portátil simulado (mock MediaMarkt)',
        productUrl: `https://clk.tradedoubler.com/click?p=270504&a=PUBID&url=https%3A%2F%2Fwww.mediamarkt.es%2Fdp%2F${ean}`,
        sourceProductUrl: `https://www.mediamarkt.es/dp/${ean}`,
        price: { value: '1099.00', currency: 'EUR' },
        identifiers: { ean },
        availability: 'in stock',
      },
    ],
  };
}

/**
 * Página simulada para `enrich:mediamarkt --discover --mock`. En `page === 1` devuelve:
 * un portátil nuevo (EAN no en catálogo → "created"), un accesorio (categoría Fundas →
 * "skipped" por isLaptopProduct) y los `existingEans` mapeados a portátiles (→ "attached").
 * En `page > 1` devuelve vacío para que la enumeración pare.
 */
export function mockEnumerateResponse(
  keyword: string,
  page: number,
  _pageSize: number,
  existingEans: string[] = [],
): TdProductsResponse {
  if (page > 1) return { products: [], productHeader: { totalHits: 0 } };

  const laptop = (ean: string, name: string) => ({
    name,
    brand: 'Acer',
    categories: [{ name: 'Portátiles' }],
    productUrl: `https://clk.tradedoubler.com/click?url=https%3A%2F%2Fwww.mediamarkt.es%2Fdp%2F${ean}`,
    sourceProductUrl: `https://www.mediamarkt.es/dp/${ean}`,
    price: { value: '899.00', currency: 'EUR' },
    productImage: { url: `https://www.mediamarkt.es/img/${ean}.jpg` },
    identifiers: { ean },
    availability: 'in stock',
  });

  const products = [
    laptop('0000000000001', `Portátil nuevo ${keyword} (mock MediaMarkt)`),
    {
      name: 'Funda para portátil 15.6" (mock)',
      brand: 'Acer',
      categories: [{ name: 'Fundas y maletines' }],
      productUrl: 'https://clk.tradedoubler.com/click?url=https%3A%2F%2Fwww.mediamarkt.es%2Fdp%2Ffunda',
      price: { value: '19.99', currency: 'EUR' },
      identifiers: { ean: '0000000000002' },
      availability: 'in stock',
    },
    ...existingEans.map((ean) => laptop(ean, `Portátil existente ${ean} (mock)`)),
  ];

  return { products, productHeader: { totalHits: products.length } };
}
