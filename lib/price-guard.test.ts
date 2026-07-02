import { describe, expect, it } from 'vitest';

import { median, isHighOutlier, HIGH_OUTLIER_FACTOR, MIN_HISTORY_FOR_GUARD } from './price-guard';

describe('median', () => {
  it('impar: el central', () => {
    expect(median([1000, 900, 950])).toBe(950);
  });
  it('par: promedia los dos centrales', () => {
    expect(median([900, 1000, 950, 970])).toBe(960); // (950+970)/2
  });
  it('no muta el array de entrada', () => {
    const arr = [3, 1, 2];
    median(arr);
    expect(arr).toEqual([3, 1, 2]);
  });
});

describe('isHighOutlier', () => {
  it('marca un precio muy por encima de la mediana reciente', () => {
    expect(isHighOutlier(2216, [900, 950, 1000, 950])).toBe(true); // 2216 > 950*1.8=1710
  });
  it('NO marca una bajada real (nunca lado bajo)', () => {
    expect(isHighOutlier(700, [950, 1000, 980])).toBe(false);
  });
  it('NO marca un precio normal dentro de banda', () => {
    expect(isHighOutlier(1000, [900, 950, 1000])).toBe(false); // 1000 < 950*1.8
  });
  it('arranque en frío: menos de MIN_HISTORY_FOR_GUARD precios → acepta', () => {
    expect(isHighOutlier(9000, [])).toBe(false);
    expect(isHighOutlier(9000, [1000, 1000])).toBe(false); // solo 2 < 3
  });
  it('robusto a un pico previo en el histórico: la mediana no se disparata', () => {
    // Un único 2216 entre precios normales no arrastra la mediana → el siguiente 1000 es normal.
    expect(isHighOutlier(1000, [950, 2216, 1000, 980, 960])).toBe(false); // mediana ≈ 980
  });
  it('respeta el factor por defecto en el borde', () => {
    expect(isHighOutlier(1800, [1000, 1000, 1000])).toBe(false); // 1800 = 1000*1.8, no es ">"
    expect(isHighOutlier(1801, [1000, 1000, 1000])).toBe(true);
  });
  it('acepta un factor explícito', () => {
    expect(isHighOutlier(1600, [1000, 1000, 1000], 1.5)).toBe(true); // 1600 > 1500
    expect(isHighOutlier(1600, [1000, 1000, 1000], 2.0)).toBe(false); // 1600 < 2000
  });
  it('las constantes tienen los valores esperados', () => {
    expect(HIGH_OUTLIER_FACTOR).toBe(1.8);
    expect(MIN_HISTORY_FOR_GUARD).toBe(3);
  });
});
