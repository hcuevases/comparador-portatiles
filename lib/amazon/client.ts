// Cliente de la Product Advertising API 5.0 (PA-API). Construye el payload de las
// operaciones que usamos (GetItems por ASIN, SearchItems por palabra clave = EAN), lo
// firma con SigV4 (sign.ts) y hace fetch. Sin SDK, igual que el resto del proyecto.
//
// Credenciales y endpoint de .env.local (ver scripts/enrich-amazon.ts). Sin credenciales,
// configFromEnv() devuelve null y el conector solo puede correr en modo --mock.

import { sigv4 } from './sign';
import type { PaapiItem, PaapiResponse } from './types';

export type AmazonConfig = {
  accessKey: string;
  secretKey: string;
  partnerTag: string;
  host: string; // p.ej. webservices.amazon.es
  region: string; // p.ej. eu-west-1
  marketplace: string; // p.ej. www.amazon.es
};

const SERVICE = 'ProductAdvertisingAPI';

// Recursos que pedimos a PA-API: título + IDs externos (para casar el EAN) + precio y
// disponibilidad de la primera oferta. Cuantos menos recursos, menos peso de respuesta.
const RESOURCES = [
  'ItemInfo.Title',
  'ItemInfo.ExternalIds',
  'Offers.Listings.Price',
  'Offers.Listings.Availability.Type',
  'Offers.Listings.Availability.Message',
];

/**
 * Lee la configuración de PA-API del entorno. Devuelve null si falta alguna de las tres
 * credenciales obligatorias (entonces solo cabe --mock). Host/region/marketplace tienen
 * defaults para el marketplace español.
 */
export function configFromEnv(): AmazonConfig | null {
  const accessKey = process.env.AMAZON_ACCESS_KEY;
  const secretKey = process.env.AMAZON_SECRET_KEY;
  const partnerTag = process.env.AMAZON_PARTNER_TAG;
  if (!accessKey || !secretKey || !partnerTag) return null;
  return {
    accessKey,
    secretKey,
    partnerTag,
    host: process.env.AMAZON_HOST ?? 'webservices.amazon.es',
    region: process.env.AMAZON_REGION ?? 'eu-west-1',
    marketplace: process.env.AMAZON_MARKETPLACE ?? 'www.amazon.es',
  };
}

async function call(
  cfg: AmazonConfig,
  operation: 'GetItems' | 'SearchItems',
  payload: Record<string, unknown>,
): Promise<PaapiResponse> {
  const path = operation === 'GetItems' ? '/paapi5/getitems' : '/paapi5/searchitems';
  const target = `com.amazon.paapi5.v1.ProductAdvertisingAPIv1.${operation}`;
  const body = JSON.stringify({
    ...payload,
    PartnerTag: cfg.partnerTag,
    PartnerType: 'Associates',
    Marketplace: cfg.marketplace,
    Resources: RESOURCES,
  });

  // Firmamos content-encoding, host, x-amz-date y x-amz-target (el conjunto canónico de
  // PA-API). content-type se manda sin firmar.
  const signed = sigv4({
    method: 'POST',
    host: cfg.host,
    path,
    headers: { 'content-encoding': 'amz-1.0', 'x-amz-target': target },
    payload: body,
    accessKey: cfg.accessKey,
    secretKey: cfg.secretKey,
    region: cfg.region,
    service: SERVICE,
    date: new Date(),
  });

  const res = await fetch(`https://${cfg.host}${path}`, {
    method: 'POST',
    headers: { ...signed.headers, 'content-type': 'application/json; charset=utf-8' },
    body,
  });

  const json = (await res.json().catch(() => ({}))) as PaapiResponse;
  if (!res.ok) {
    const msg = json.Errors?.[0]?.Message ?? `HTTP ${res.status}`;
    throw new Error(`PA-API ${operation} ${res.status}: ${msg}`);
  }
  return json;
}

export async function getItemsByAsin(cfg: AmazonConfig, asins: string[]): Promise<PaapiItem[]> {
  if (asins.length === 0) return [];
  const r = await call(cfg, 'GetItems', { ItemIds: asins, ItemIdType: 'ASIN' });
  return r.ItemsResult?.Items ?? [];
}

export async function searchItemsByEan(cfg: AmazonConfig, ean: string): Promise<PaapiItem[]> {
  const r = await call(cfg, 'SearchItems', { Keywords: ean, SearchIndex: 'Electronics', ItemCount: 3 });
  return r.SearchResult?.Items ?? [];
}
