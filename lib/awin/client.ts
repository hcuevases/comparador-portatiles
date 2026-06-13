// Descarga del feed de producto de Awin (El Corte Inglés). A diferencia de Amazon/
// Tradedoubler (query por EAN), Awin entrega un feed completo (CSV, gzip) que descargamos
// una vez y luego cruzamos por EAN. Sin SDK. Credenciales de .env.local; sin ellas,
// configFromEnv() devuelve null y el conector solo corre en modo --mock.
//
// OJO: la disponibilidad real del feed de El Corte Inglés solo se confirma estando dado de
// alta como publisher en Awin y aprobado por el anunciante (ver ADR-008).

import { gunzipSync } from 'node:zlib';

export type AwinConfig = { apiKey: string; feedId: string };

export function configFromEnv(): AwinConfig | null {
  const apiKey = process.env.AWIN_API_KEY;
  const feedId = process.env.AWIN_FEED_ID;
  if (!apiKey || !feedId) return null;
  return { apiKey, feedId };
}

// Columnas que pedimos en la descarga (las imprescindibles + un par informativas).
// Columnas pedidas: las imprescindibles + las que usa el modo descubrimiento
// (brand/categoría/imagen) para crear laptops nuevos.
const COLUMNS = [
  'ean',
  'search_price',
  'aw_deep_link',
  'in_stock',
  'product_name',
  'brand_name',
  'merchant_category',
  'merchant_image_url',
].join(',');

/**
 * Descarga el feed de producto de El Corte Inglés y devuelve el CSV ya descomprimido.
 * URL de Create-a-Feed de Awin: productdata.awin.com/datafeed/download/apikey/.../fid/.../...
 * (revisar la URL exacta en el panel de Awin al activar; ver ADR-008).
 */
export async function downloadFeed(cfg: AwinConfig): Promise<string> {
  const url =
    `https://productdata.awin.com/datafeed/download/apikey/${encodeURIComponent(cfg.apiKey)}` +
    `/language/es/fid/${encodeURIComponent(cfg.feedId)}/columns/${COLUMNS}` +
    `/format/csv/delimiter/%2C/compression/gzip/`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Awin feed ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return gunzipSync(buf).toString('utf8');
}
