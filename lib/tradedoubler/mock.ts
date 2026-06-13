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
