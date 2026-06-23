import { describe, expect, it } from 'vitest';

import { countActiveFilters } from './active-filters';

const p = (q: string) => new URLSearchParams(q);

describe('countActiveFilters', () => {
  it('sin filtros → 0', () => {
    expect(countActiveFilters(p(''))).toBe(0);
  });
  it('cada marca cuenta por separado', () => {
    expect(countActiveFilters(p('brand=Acer,HP,Lenovo'))).toBe(3);
  });
  it('ram/screen/line/cond/price suman 1 cada uno', () => {
    expect(countActiveFilters(p('ram_min=16'))).toBe(1);
    expect(countActiveFilters(p('screen=14'))).toBe(1);
    expect(countActiveFilters(p('line=ThinkPad'))).toBe(1);
    expect(countActiveFilters(p('cond=nuevos'))).toBe(1);
    expect(countActiveFilters(p('price_max=1200'))).toBe(1);
  });
  it('cada característica activa suma 1', () => {
    expect(countActiveFilters(p('gaming=1&ai=1&oled=1'))).toBe(3);
    expect(countActiveFilters(p('gaming=0'))).toBe(0); // solo cuenta '1'
  });
  it('q (buscador del hero) NO cuenta', () => {
    expect(countActiveFilters(p('q=macbook'))).toBe(0);
  });
  it('combinación', () => {
    expect(countActiveFilters(p('brand=Acer,HP&ram_min=16&oled=1&q=x'))).toBe(4);
  });
});
