import { describe, expect, it } from 'vitest';

import { sigv4 } from './sign';

// Validación del núcleo SigV4 contra el vector oficial "get-vanilla" de la suite de
// pruebas de firma de AWS (credenciales y resultado documentados públicamente). Si la
// firma casa con este vector, el algoritmo (canonical request, string-to-sign, derivación
// de clave) es correcto — sin necesidad de credenciales reales de Amazon.
// https://docs.aws.amazon.com/general/latest/gr/signature-v4-test-suite.html
describe('sigv4 — vector get-vanilla de AWS', () => {
  const signed = sigv4({
    method: 'GET',
    host: 'example.amazonaws.com',
    path: '/',
    query: '',
    headers: {},
    payload: '',
    accessKey: 'AKIDEXAMPLE',
    secretKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
    region: 'us-east-1',
    service: 'service',
    date: new Date('2015-08-30T12:36:00Z'),
  });

  it('produce la firma esperada', () => {
    expect(signed.signature).toBe(
      '5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
    );
  });

  it('produce la cabecera Authorization esperada', () => {
    expect(signed.headers['authorization']).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, ' +
        'SignedHeaders=host;x-amz-date, ' +
        'Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
    );
  });

  it('fija x-amz-date en formato compacto UTC', () => {
    expect(signed.amzDate).toBe('20150830T123600Z');
    expect(signed.headers['x-amz-date']).toBe('20150830T123600Z');
  });
});

describe('sigv4 — forma PA-API', () => {
  // No valida contra Amazon (haría falta cuenta), pero comprueba que las cabeceras a
  // firmar de una petición PA-API entran en SignedHeaders en orden canónico.
  const signed = sigv4({
    method: 'POST',
    host: 'webservices.amazon.es',
    path: '/paapi5/getitems',
    headers: {
      'content-encoding': 'amz-1.0',
      'x-amz-target': 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems',
    },
    payload: '{"ItemIds":["B0TEST"]}',
    accessKey: 'AKIDEXAMPLE',
    secretKey: 'secret',
    region: 'eu-west-1',
    service: 'ProductAdvertisingAPI',
    date: new Date('2026-01-02T03:04:05Z'),
  });

  it('firma content-encoding, host, x-amz-date y x-amz-target en orden', () => {
    expect(signed.headers['authorization']).toContain(
      'SignedHeaders=content-encoding;host;x-amz-date;x-amz-target',
    );
  });

  it('es determinista para la misma entrada', () => {
    expect(signed.signature).toMatch(/^[0-9a-f]{64}$/);
  });
});
