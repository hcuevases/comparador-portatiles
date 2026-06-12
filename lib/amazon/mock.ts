// Respuesta de PA-API simulada para el modo --mock del conector. Permite ejercitar el
// pipeline completo (cargar objetivos → mapear → escribir) sin cuenta de Associates.
// Devuelve un item con el EAN pedido para que pickItemByEan lo case.

import type { PaapiResponse } from './types';

export function mockSearchResponse(ean: string): PaapiResponse {
  return {
    SearchResult: {
      Items: [
        {
          ASIN: `MOCK${ean.slice(-6)}`,
          DetailPageURL: `https://www.amazon.es/dp/MOCK${ean.slice(-6)}?tag=mock-21`,
          Offers: {
            Listings: [
              {
                Price: { Amount: 999.99, Currency: 'EUR', DisplayAmount: '999,99 €' },
                Availability: { Type: 'Now', Message: 'En stock (simulado).' },
              },
            ],
          },
          ItemInfo: {
            Title: { DisplayValue: 'Portátil simulado (mock)' },
            ExternalIds: { EANs: { DisplayValues: [ean] } },
          },
        },
      ],
    },
  };
}
