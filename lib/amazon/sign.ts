// Firma AWS Signature Version 4 (SigV4) para la Product Advertising API 5.0.
//
// PA-API exige peticiones firmadas con SigV4 (servicio "ProductAdvertisingAPI"). Igual
// que el resto del proyecto (Algolia, Brevo, Supabase), NO usamos SDK: la firma es
// determinista y se implementa con node:crypto, lo que además la hace testeable sin
// credenciales reales (ver sign.test.ts, validado contra el vector oficial "get-vanilla"
// de la suite de pruebas de AWS).
//
// Referencia: https://docs.aws.amazon.com/general/latest/gr/sigv4-create-canonical-request.html

import { createHash, createHmac } from 'node:crypto';

function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

// 'YYYYMMDDTHHMMSSZ' + 'YYYYMMDD' a partir de un Date (en UTC, como exige SigV4).
function amzDateParts(date: Date): { amz: string; stamp: string } {
  const amz = date.toISOString().replace(/[:-]|\.\d{3}/g, ''); // 2015-08-30T12:36:00.000Z → 20150830T123600Z
  return { amz, stamp: amz.slice(0, 8) };
}

export type Sigv4Input = {
  method: string;
  host: string;
  path: string;
  query?: string;
  // Cabeceras A FIRMAR (sin host ni x-amz-date: se añaden aquí). Nombres en minúsculas.
  headers: Record<string, string>;
  payload: string;
  accessKey: string;
  secretKey: string;
  region: string;
  service: string;
  date: Date;
};

export type SignedRequest = {
  // Cabeceras de entrada + host, x-amz-date y authorization. Listas para fetch().
  headers: Record<string, string>;
  amzDate: string;
  signature: string;
};

/**
 * Firma una petición y devuelve las cabeceras (incluida Authorization). Pura: dado el
 * mismo `date` produce la misma firma. Solo firma las cabeceras que recibe en `headers`
 * (más host y x-amz-date); manda cualquier cabecera extra (p.ej. content-type) sin
 * firmar añadiéndola al resultado en el llamador.
 */
export function sigv4(input: Sigv4Input): SignedRequest {
  const { method, host, path, query = '', payload, accessKey, secretKey, region, service, date } = input;
  const { amz, stamp } = amzDateParts(date);

  // Conjunto a firmar: cabeceras de entrada + host + x-amz-date, en minúsculas y trim.
  const lower = new Map<string, string>();
  for (const [k, v] of Object.entries(input.headers)) lower.set(k.toLowerCase(), String(v).trim());
  lower.set('host', host);
  lower.set('x-amz-date', amz);

  const sortedNames = [...lower.keys()].sort();
  const canonicalHeaders = sortedNames.map((n) => `${n}:${lower.get(n)}\n`).join('');
  const signedHeaders = sortedNames.join(';');
  const payloadHash = sha256Hex(payload);

  const canonicalRequest = [method, path, query, canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const scope = `${stamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amz, scope, sha256Hex(canonicalRequest)].join('\n');

  const kDate = hmac(`AWS4${secretKey}`, stamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers: Record<string, string> = {};
  for (const n of sortedNames) headers[n] = lower.get(n)!;
  headers['authorization'] = authorization;

  return { headers, amzDate: amz, signature };
}
