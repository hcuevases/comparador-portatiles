import { describe, expect, it } from 'vitest';

import { mergeSelectionIds, orderByIds } from './compare-merge';

describe('mergeSelectionIds', () => {
  it('local primero, luego los del servidor que faltan', () => {
    expect(mergeSelectionIds(['a', 'b'], ['c', 'd'], 4)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('deduplica conservando la primera aparición (local)', () => {
    expect(mergeSelectionIds(['a', 'b'], ['b', 'c'], 4)).toEqual(['a', 'b', 'c']);
  });

  it('respeta el tope', () => {
    expect(mergeSelectionIds(['a', 'b', 'c'], ['d', 'e'], 4)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('listas vacías', () => {
    expect(mergeSelectionIds([], [], 4)).toEqual([]);
    expect(mergeSelectionIds([], ['a'], 4)).toEqual(['a']);
    expect(mergeSelectionIds(['a'], [], 4)).toEqual(['a']);
  });

  it('local ya en el tope ignora el servidor', () => {
    expect(mergeSelectionIds(['a', 'b', 'c', 'd'], ['e'], 4)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('orderByIds', () => {
  it('reordena los items según los ids', () => {
    const items = [
      { id: 'b', n: 2 },
      { id: 'a', n: 1 },
    ];
    expect(orderByIds(['a', 'b'], items)).toEqual([
      { id: 'a', n: 1 },
      { id: 'b', n: 2 },
    ]);
  });

  it('descarta ids cuyo item no existe (p.ej. laptop borrada por el dedup)', () => {
    const items = [
      { id: 'a', n: 1 },
      { id: 'b', n: 2 },
    ];
    // 'c' no está en items → se descarta; se mantiene el orden de los ids.
    expect(orderByIds(['c', 'a', 'b'], items)).toEqual([
      { id: 'a', n: 1 },
      { id: 'b', n: 2 },
    ]);
  });

  it('listas vacías', () => {
    expect(orderByIds([], [{ id: 'a' }])).toEqual([]);
    expect(orderByIds(['a'], [])).toEqual([]);
  });
});
