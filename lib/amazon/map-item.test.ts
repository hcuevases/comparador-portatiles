import { describe, expect, it } from 'vitest';

import { mapItem, pickItemByEan } from './map-item';
import type { PaapiItem } from './types';

const full: PaapiItem = {
  ASIN: 'B0EXAMPLE01',
  DetailPageURL: 'https://www.amazon.es/dp/B0EXAMPLE01?tag=mytag-21',
  Offers: {
    Listings: [
      {
        Price: { Amount: 1199.0, Currency: 'EUR', DisplayAmount: '1.199,00 €' },
        Availability: { Type: 'Now', Message: 'En stock.' },
      },
    ],
  },
  ItemInfo: { ExternalIds: { EANs: { DisplayValues: ['0197497021547'] } } },
};

describe('mapItem', () => {
  it('mapea una oferta completa en EUR', () => {
    expect(mapItem(full)).toEqual({
      asin: 'B0EXAMPLE01',
      priceEur: 1199.0,
      currency: 'EUR',
      url: 'https://www.amazon.es/dp/B0EXAMPLE01?tag=mytag-21',
      inStock: true,
    });
  });

  it('deja priceEur null si la moneda no es EUR (pero conserva url y asin)', () => {
    const usd: PaapiItem = {
      ...full,
      Offers: { Listings: [{ Price: { Amount: 999, Currency: 'USD' } }] },
    };
    expect(mapItem(usd)).toMatchObject({ asin: 'B0EXAMPLE01', priceEur: null, currency: 'USD' });
  });

  it('priceEur null y inStock null cuando no hay oferta', () => {
    const noOffer: PaapiItem = { ASIN: 'B0', DetailPageURL: 'https://x/dp/B0' };
    expect(mapItem(noOffer)).toEqual({
      asin: 'B0',
      priceEur: null,
      currency: null,
      url: 'https://x/dp/B0',
      inStock: null,
    });
  });

  it('inStock false si no está disponible ya', () => {
    const soon: PaapiItem = {
      ...full,
      Offers: { Listings: [{ Availability: { Type: 'Future' } }] },
    };
    expect(mapItem(soon)?.inStock).toBe(false);
  });

  it('devuelve null sin ASIN o sin URL', () => {
    expect(mapItem({ DetailPageURL: 'https://x' })).toBeNull();
    expect(mapItem({ ASIN: 'B0' })).toBeNull();
  });
});

describe('pickItemByEan', () => {
  const other: PaapiItem = {
    ASIN: 'B0ACCESSORY',
    DetailPageURL: 'https://x',
    ItemInfo: { ExternalIds: { EANs: { DisplayValues: ['1111111111111'] } } },
  };

  it('elige el item cuyo EAN coincide', () => {
    expect(pickItemByEan([other, full], '0197497021547')?.ASIN).toBe('B0EXAMPLE01');
  });

  it('devuelve null si ningún item declara el EAN buscado', () => {
    expect(pickItemByEan([other], '0197497021547')).toBeNull();
  });

  it('devuelve null con lista vacía', () => {
    expect(pickItemByEan([], '0197497021547')).toBeNull();
  });
});
