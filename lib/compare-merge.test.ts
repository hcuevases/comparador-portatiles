import { describe, expect, it } from 'vitest';

import { mergeSelectionIds } from './compare-merge';

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
