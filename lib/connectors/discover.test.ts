import { describe, expect, it } from 'vitest';

import { isLaptopProduct, makeSlug, parseBrandModel } from './discover';

describe('isLaptopProduct', () => {
  it('acepta portátiles', () => {
    expect(isLaptopProduct('Informática > Portátiles', 'HP Pavilion 15')).toBe(true);
    expect(isLaptopProduct(null, 'Portátil Lenovo IdeaPad')).toBe(true);
    expect(isLaptopProduct('Laptops', 'MacBook Air M3')).toBe(true);
  });

  it('rechaza accesorios aunque mencionen portátil', () => {
    expect(isLaptopProduct('Accesorios', 'Funda para portátil 15"')).toBe(false);
    expect(isLaptopProduct('Periféricos', 'Cargador portátil USB-C 65W')).toBe(false);
    expect(isLaptopProduct('Mochilas', 'Mochila para portátil')).toBe(false);
  });

  it('rechaza otras categorías', () => {
    expect(isLaptopProduct('Monitores', 'Monitor LG 27"')).toBe(false);
    expect(isLaptopProduct('Tablets', 'Samsung Galaxy Tab')).toBe(false);
  });
});

describe('parseBrandModel', () => {
  it('usa el campo brand si viene y lo quita del nombre', () => {
    expect(parseBrandModel('HP Pavilion 15-eg2002ns', 'HP')).toEqual({ brand: 'HP', model: 'Pavilion 15-eg2002ns' });
  });

  it('detecta marca conocida en el nombre si no hay campo brand', () => {
    expect(parseBrandModel('Portátil Lenovo IdeaPad Slim 3 15')).toEqual({ brand: 'Lenovo', model: 'IdeaPad Slim 3 15' });
  });

  it('cae a la primera palabra si no reconoce marca', () => {
    expect(parseBrandModel('Innjoo Voom Laptop Pro')).toEqual({ brand: 'Innjoo', model: 'Voom Laptop Pro' });
  });

  it('null si el nombre queda vacío', () => {
    expect(parseBrandModel('Portátil ')).toBeNull();
  });
});

describe('makeSlug', () => {
  it('genera slug URL-safe con sufijo de EAN', () => {
    expect(makeSlug('HP', 'Pavilion 15-eg2002ns', '0197497021547')).toBe('hp-pavilion-15-eg2002ns-021547');
  });

  it('normaliza tildes y caracteres raros', () => {
    expect(makeSlug('Acer', 'Aspire 5 · 15,6"', '1234567890123')).toBe('acer-aspire-5-15-6-890123');
  });
});
