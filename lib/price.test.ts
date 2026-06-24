import { describe, expect, it } from 'vitest';

import { isPlausiblePrice, sanePrice, MIN_PLAUSIBLE_PRICE_EUR, MAX_PLAUSIBLE_PRICE_EUR } from './price';

describe('isPlausiblePrice', () => {
  it('acepta precios reales de portátil', () => {
    expect(isPlausiblePrice(769.45)).toBe(true);
    expect(isPlausiblePrice(269)).toBe(true);
    expect(isPlausiblePrice(8270.22)).toBe(true); // workstation cara real
  });

  it('rechaza los centinelas de PcComponentes', () => {
    expect(isPlausiblePrice(6.45)).toBe(false);
    expect(isPlausiblePrice(9999)).toBe(false);
    expect(isPlausiblePrice(10005.45)).toBe(false);
  });

  it('respeta los límites (inclusivos)', () => {
    expect(isPlausiblePrice(MIN_PLAUSIBLE_PRICE_EUR)).toBe(true); // 100
    expect(isPlausiblePrice(MIN_PLAUSIBLE_PRICE_EUR - 0.01)).toBe(false);
    expect(isPlausiblePrice(MAX_PLAUSIBLE_PRICE_EUR)).toBe(true); // 9500
    expect(isPlausiblePrice(MAX_PLAUSIBLE_PRICE_EUR + 0.01)).toBe(false);
  });

  it('rechaza null/undefined/NaN', () => {
    expect(isPlausiblePrice(null)).toBe(false);
    expect(isPlausiblePrice(undefined)).toBe(false);
    expect(isPlausiblePrice(NaN)).toBe(false);
  });
});

describe('sanePrice', () => {
  it('devuelve el precio si es plausible, null si no', () => {
    expect(sanePrice(769.45)).toBe(769.45);
    expect(sanePrice(6.45)).toBeNull();
    expect(sanePrice(10005.45)).toBeNull();
    expect(sanePrice(null)).toBeNull();
  });
});
