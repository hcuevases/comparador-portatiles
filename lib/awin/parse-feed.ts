// Parseo puro del feed de producto de Awin (El Corte Inglés). El feed es CSV (las columnas
// se piden al descargar); mapeamos por nombre de cabecera, tolerante a variantes. Sin red ni
// estado → unit-testeable.

import type { AwinFeedRow } from './types';

/**
 * CSV RFC4180 mínimo: maneja comillas dobles, `""` escapado, y comas/saltos dentro de
 * comillas. Suficiente para los feeds de Awin (delimitador coma).
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function findCol(header: string[], candidates: string[]): number {
  const lower = header.map((h) => h.trim().toLowerCase());
  for (const cand of candidates) {
    const i = lower.indexOf(cand);
    if (i !== -1) return i;
  }
  return -1;
}

function parsePrice(s: string): number | null {
  if (!s) return null;
  let v = s.trim();
  if (v.includes(',') && !v.includes('.')) v = v.replace(',', '.');
  else if (v.includes(',') && v.includes('.')) v = v.replace(/\./g, '').replace(',', '.');
  const n = Number(v.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseStock(s: string): boolean | null {
  if (!s) return null;
  const v = s.trim().toLowerCase();
  if (v === '1' || v === 'true' || /in\s*stock|disponible|yes/.test(v)) return true;
  if (v === '0' || v === 'false' || /out\s*of\s*stock|agotado/.test(v)) return false;
  return null;
}

/**
 * Parsea el feed CSV de Awin a filas {ean, priceEur, url, inStock}. La 1ª línea es la
 * cabecera. Asume precio en EUR (feed del marketplace ES). Descarta filas sin EAN o sin
 * enlace de afiliado. Si faltan las columnas EAN o deeplink, devuelve [].
 */
export function parseAwinFeed(csv: string): AwinFeedRow[] {
  const table = parseCsv(csv);
  if (table.length < 2) return [];
  const header = table[0];
  const eanCol = findCol(header, ['ean', 'gtin']);
  const priceCol = findCol(header, ['search_price', 'store_price', 'price', 'display_price']);
  const urlCol = findCol(header, ['aw_deep_link', 'deep_link', 'awdeeplink']);
  const stockCol = findCol(header, ['in_stock', 'stock_status', 'availability']);
  if (eanCol === -1 || urlCol === -1) return [];

  const out: AwinFeedRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const ean = (cells[eanCol] ?? '').trim();
    const url = (cells[urlCol] ?? '').trim();
    if (!ean || !url) continue;
    out.push({
      ean,
      url,
      priceEur: priceCol === -1 ? null : parsePrice(cells[priceCol] ?? ''),
      inStock: stockCol === -1 ? null : parseStock(cells[stockCol] ?? ''),
    });
  }
  return out;
}

// Índice ean → fila (conserva la primera; el feed trae ~una fila por producto).
export function indexByEan(rows: AwinFeedRow[]): Map<string, AwinFeedRow> {
  const m = new Map<string, AwinFeedRow>();
  for (const row of rows) if (!m.has(row.ean)) m.set(row.ean, row);
  return m;
}
