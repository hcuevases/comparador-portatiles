import { describe, expect, it } from 'vitest';

import { classifyResponse } from './link-health';

describe('classifyResponse', () => {
  it('410 Gone → dead', () => {
    expect(classifyResponse(410, 'Producto')).toBe('dead');
  });

  it('404 → dead', () => {
    expect(classifyResponse(404, 'Producto')).toBe('dead');
  });

  it('200 con título normal → alive', () => {
    expect(classifyResponse(200, 'Portátil Acer Nitro V — PcComponentes')).toBe('alive');
  });

  it('200 pero título "página no encontrada" (soft-404) → dead', () => {
    expect(classifyResponse(200, 'Página no encontrada')).toBe('dead');
  });

  it('200 con reto de Cloudflare sin resolver → inconclusive', () => {
    expect(classifyResponse(200, 'Just a moment...')).toBe('inconclusive');
    expect(classifyResponse(200, 'Un momento…')).toBe('inconclusive');
  });

  it('403 (bloqueo) → inconclusive', () => {
    expect(classifyResponse(403, '')).toBe('inconclusive');
  });

  it('0 (timeout/sin respuesta) → inconclusive', () => {
    expect(classifyResponse(0, '')).toBe('inconclusive');
  });

  it('500 → inconclusive', () => {
    expect(classifyResponse(500, 'Error')).toBe('inconclusive');
  });
});
