import { describe, expect, it, vi } from 'vitest';

import { enumerateLaptops, type FetchPage } from './client';
import type { TdProduct, TdProductsResponse } from './types';

const cfg = { token: 't', feedId: 'f' };
const prod = (ean: string): TdProduct => ({
  name: `Portátil ${ean}`,
  productUrl: `https://x/${ean}`,
  identifiers: { ean },
});

describe('enumerateLaptops', () => {
  it('pagina hasta agotar totalHits y une keywords deduplicando por EAN', async () => {
    // Cada keyword devuelve 2 productos en page 1; 'a' y 'b' comparten EAN '1'.
    const fetchPage: FetchPage = vi.fn(async (_c, keyword, page) => {
      if (page > 1) return { products: [], productHeader: { totalHits: 2 } };
      const map: Record<string, TdProductsResponse> = {
        a: { products: [prod('1'), prod('2')], productHeader: { totalHits: 2 } },
        b: { products: [prod('1'), prod('3')], productHeader: { totalHits: 2 } },
      };
      return map[keyword] ?? { products: [] };
    });

    const out = await enumerateLaptops(cfg, { keywords: ['a', 'b'], pageSize: 2, fetchPage });
    expect(out.map((p) => p.identifiers?.ean).sort()).toEqual(['1', '2', '3']);
  });

  it('para cuando la página viene incompleta (menos que pageSize)', async () => {
    const fetchPage: FetchPage = vi.fn(async () => ({ products: [prod('1')] })); // 1 < pageSize
    const out = await enumerateLaptops(cfg, { keywords: ['a'], pageSize: 5, fetchPage });
    expect(out).toHaveLength(1);
    expect(fetchPage).toHaveBeenCalledTimes(1); // no pide page 2
  });

  it('respeta maxPerKeyword', async () => {
    const fetchPage: FetchPage = vi.fn(async () => ({
      products: [prod(String(Math.random()))], // siempre 1, nunca se agota por tamaño
      productHeader: { totalHits: 9999 },
    }));
    await enumerateLaptops(cfg, { keywords: ['a'], pageSize: 1, maxPerKeyword: 3, fetchPage });
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it('un error en una página no es fatal: corta esa keyword y sigue', async () => {
    const fetchPage: FetchPage = vi.fn(async (_c, keyword) => {
      if (keyword === 'a') throw new Error('boom');
      return { products: [prod('9')] };
    });
    const out = await enumerateLaptops(cfg, { keywords: ['a', 'b'], pageSize: 5, fetchPage });
    expect(out.map((p) => p.identifiers?.ean)).toEqual(['9']);
  });

  it('conserva productos sin EAN (no se deduplican)', async () => {
    const noEan: TdProduct = { name: 'x', productUrl: 'https://x' };
    const fetchPage: FetchPage = vi.fn(async () => ({ products: [noEan, noEan] }));
    const out = await enumerateLaptops(cfg, { keywords: ['a'], pageSize: 5, fetchPage });
    expect(out).toHaveLength(2);
  });
});
