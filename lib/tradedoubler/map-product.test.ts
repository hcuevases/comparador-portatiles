import { describe, expect, it } from 'vitest';

import { mapProduct, parsePrice, pickByEan, toDiscovered } from './map-product';
import type { TdProduct } from './types';

const prod: TdProduct = {
  name: 'MSI Katana',
  productUrl: 'https://clk.tradedoubler.com/click?p=270504&a=PUB&url=https%3A%2F%2Fmediamarkt.es%2Fx',
  sourceProductUrl: 'https://www.mediamarkt.es/x',
  price: { value: '1099.00', currency: 'EUR' },
  identifiers: { ean: '4711122334455' },
  availability: 'in stock',
};

describe('parsePrice', () => {
  it.each([
    ['1199.00', 1199],
    ['1.199,00', 1199],
    ['1099,90', 1099.9],
    ['999', 999],
    [1499.5, 1499.5],
    ['', null],
    [undefined, null],
  ])('parsePrice(%j) → %j', (input, expected) => {
    expect(parsePrice(input as string | number | undefined)).toBe(expected);
  });
});

describe('mapProduct', () => {
  it('mapea producto en EUR usando el productUrl trackeado', () => {
    expect(mapProduct(prod)).toEqual({
      url: 'https://clk.tradedoubler.com/click?p=270504&a=PUB&url=https%3A%2F%2Fmediamarkt.es%2Fx',
      priceEur: 1099,
      inStock: true,
    });
  });

  it('priceEur null si no es EUR', () => {
    expect(mapProduct({ ...prod, price: { value: '999', currency: 'GBP' } })?.priceEur).toBeNull();
  });

  it('null sin productUrl', () => {
    expect(mapProduct({ ...prod, productUrl: undefined })).toBeNull();
  });
});

describe('pickByEan', () => {
  const other: TdProduct = { productUrl: 'https://x', identifiers: { ean: '0000000000000' } };

  it('elige el del EAN exacto', () => {
    expect(pickByEan([other, prod], '4711122334455')?.name).toBe('MSI Katana');
  });

  it('null si hay EANs pero ninguno coincide', () => {
    expect(pickByEan([other], '4711122334455')).toBeNull();
  });

  it('si ningún producto declara EAN, confía en el filtro del servidor (primero)', () => {
    const noEan: TdProduct = { productUrl: 'https://y' };
    expect(pickByEan([noEan], '4711122334455')).toBe(noEan);
  });
});

describe('toDiscovered', () => {
  const base = {
    name: 'Portátil Acer Aspire 5',
    productUrl: 'https://clk.tradedoubler.com/click?url=x',
    price: { value: '899.00', currency: 'EUR' },
    productImage: { url: 'https://img/x.jpg' },
    identifiers: { ean: '4711121212121' },
    brand: 'Acer',
    categories: [{ name: 'Portátiles' }],
    availability: 'in stock',
  };

  it('mapea un producto completo', () => {
    expect(toDiscovered(base)).toEqual({
      ean: '4711121212121',
      name: 'Portátil Acer Aspire 5',
      brand: 'Acer',
      category: 'Portátiles',
      imageUrl: 'https://img/x.jpg',
      offer: { url: 'https://clk.tradedoubler.com/click?url=x', priceEur: 899, inStock: true },
    });
  });

  it('descarta si no hay EAN', () => {
    expect(toDiscovered({ ...base, identifiers: {} })).toBeNull();
    expect(toDiscovered({ ...base, identifiers: undefined })).toBeNull();
  });

  it('descarta si no hay productUrl (mapProduct → null)', () => {
    expect(toDiscovered({ ...base, productUrl: undefined })).toBeNull();
  });

  it('campos opcionales ausentes → null/cadena vacía, sin romper', () => {
    const r = toDiscovered({ productUrl: 'https://x', identifiers: { ean: '1' } });
    expect(r).toEqual({
      ean: '1',
      name: '',
      brand: null,
      category: null,
      imageUrl: null,
      offer: { url: 'https://x', priceEur: null, inStock: null },
    });
  });
});
