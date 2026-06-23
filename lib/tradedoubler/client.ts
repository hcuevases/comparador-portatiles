// Cliente de la Products API de Tradedoubler (MediaMarkt). Consulta productos por EAN en
// tiempo real. Sin SDK (fetch nativo). Credenciales de .env.local; sin ellas,
// configFromEnv() devuelve null y el conector solo corre en modo --mock.
//
// Endpoint (matrix params): GET api.tradedoubler.com/1.0/products.json;fid=<feed>;ean=<ean>?token=<token>
// El `fid` es el id del feed de producto de MediaMarkt en tu cuenta de publisher; el token
// se saca de Account → Manage tokens → PRODUCTS. OJO: la disponibilidad del feed de
// MediaMarkt solo se confirma al estar dado de alta y aprobado (ver ADR-008).

import { setTimeout as sleep } from 'node:timers/promises';

import type { TdProduct, TdProductsResponse } from './types';

export type TradedoublerConfig = { token: string; feedId: string };

export function configFromEnv(): TradedoublerConfig | null {
  const token = process.env.TRADEDOUBLER_TOKEN;
  const feedId = process.env.TRADEDOUBLER_FEED_ID;
  if (!token || !feedId) return null;
  return { token, feedId };
}

export async function searchProductsByEan(cfg: TradedoublerConfig, ean: string): Promise<TdProduct[]> {
  const fid = encodeURIComponent(cfg.feedId);
  const eanEnc = encodeURIComponent(ean);
  const url =
    `https://api.tradedoubler.com/1.0/products.json;fid=${fid};ean=${eanEnc};limit=5` +
    `?token=${encodeURIComponent(cfg.token)}`;

  const res = await fetch(url);
  const json = (await res.json().catch(() => ({}))) as TdProductsResponse;
  if (!res.ok) {
    throw new Error(`Tradedoubler ${res.status}: ${JSON.stringify(json).slice(0, 150)}`);
  }
  return json.products ?? [];
}

// Keywords por defecto para acotar a portátiles (el feed es todo el catálogo de
// MediaMarkt y la API corta a 1000 resultados por búsqueda → hay que filtrar).
export const DISCOVER_KEYWORDS = ['portatil', 'laptop', 'notebook', 'macbook'] as const;

// Fuente de una página de resultados. Inyectable para tests y para el modo --mock.
export type FetchPage = (
  cfg: TradedoublerConfig,
  keyword: string,
  page: number,
  pageSize: number,
) => Promise<TdProductsResponse>;

export type EnumerateOpts = {
  keywords?: readonly string[]; // default: DISCOVER_KEYWORDS
  pageSize?: number; // default: 60
  maxPerKeyword?: number; // tope de productos acumulados por keyword; default 1000 (≈ límite de la API: 1000 resultados/búsqueda)
  delayMs?: number; // sleep entre páginas reales; default: 1100
  fetchPage?: FetchPage; // default: fetch real
};

async function fetchPageReal(
  cfg: TradedoublerConfig,
  keyword: string,
  page: number,
  pageSize: number,
): Promise<TdProductsResponse> {
  const fid = encodeURIComponent(cfg.feedId);
  const q = encodeURIComponent(keyword);
  const url =
    `https://api.tradedoubler.com/1.0/products.json;fid=${fid};q=${q};pageSize=${pageSize};page=${page}` +
    `?token=${encodeURIComponent(cfg.token)}`;
  const res = await fetch(url);
  const json = (await res.json().catch(() => ({}))) as TdProductsResponse;
  if (!res.ok) {
    throw new Error(`Tradedoubler ${res.status}: ${JSON.stringify(json).slice(0, 150)}`);
  }
  return json;
}

/**
 * Enumera productos del feed acotando por keyword (varias pasadas) y deduplicando por
 * EAN. Para de paginar cuando la página viene vacía/incompleta, se alcanza `totalHits`
 * o `maxPerKeyword`. Un error de página no es fatal: corta esa keyword y sigue.
 */
export async function enumerateLaptops(
  cfg: TradedoublerConfig,
  opts: EnumerateOpts = {},
): Promise<TdProduct[]> {
  const keywords = opts.keywords ?? DISCOVER_KEYWORDS;
  const pageSize = opts.pageSize ?? 60;
  const maxPerKeyword = opts.maxPerKeyword ?? 1000;
  const delayMs = opts.delayMs ?? 1100;
  const fetchPage = opts.fetchPage ?? fetchPageReal;
  const isReal = opts.fetchPage == null;

  const byEan = new Map<string, TdProduct>();
  const withoutEan: TdProduct[] = [];

  for (const keyword of keywords) {
    let count = 0;
    for (let page = 1; ; page++) {
      let resp: TdProductsResponse;
      try {
        resp = await fetchPage(cfg, keyword, page, pageSize);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`enumerateLaptops "${keyword}" p${page}: ${msg.slice(0, 80)}`);
        break;
      }
      const products = resp.products ?? [];
      if (products.length === 0) break;
      for (const p of products) {
        const ean = p.identifiers?.ean;
        if (ean) {
          if (!byEan.has(ean)) byEan.set(ean, p);
        } else {
          withoutEan.push(p);
        }
        count++;
      }
      const total = resp.productHeader?.totalHits;
      if (count >= maxPerKeyword) break;
      if (total != null && page * pageSize >= total) break;
      if (products.length < pageSize) break; // última página parcial
      if (isReal) await sleep(delayMs); // rate-limit solo en red real
    }
  }

  return [...byEan.values(), ...withoutEan];
}
