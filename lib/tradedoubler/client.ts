// Cliente de la Products API de Tradedoubler (MediaMarkt). Consulta productos por EAN en
// tiempo real. Sin SDK (fetch nativo). Credenciales de .env.local; sin ellas,
// configFromEnv() devuelve null y el conector solo corre en modo --mock.
//
// Endpoint (matrix params): GET api.tradedoubler.com/1.0/products.json;fid=<feed>;ean=<ean>?token=<token>
// El `fid` es el id del feed de producto de MediaMarkt en tu cuenta de publisher; el token
// se saca de Account → Manage tokens → PRODUCTS. OJO: la disponibilidad del feed de
// MediaMarkt solo se confirma al estar dado de alta y aprobado (ver ADR-008).

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
