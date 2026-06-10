import { describe, expect, it } from 'vitest';

import { parseScreen } from './parse-screen';

// Fixtures con etiquetas plausibles de la ficha de PcComponentes (vendedor +
// fabricante). NO verificadas contra la ficha real (Cloudflare) — al recuperar acceso
// hay que validar con --dry-run y ajustar regex; estos tests fijan el comportamiento.

describe('parseScreen', () => {
  it('extrae brillo, táctil, gama, HDR y respuesta', () => {
    const map: Record<string, string> = {
      Brillo: '400 cd/m²',
      'Pantalla táctil': 'Sí',
      'Gama de color': '100% DCI-P3',
      'Tecnología HDR': 'HDR 400',
      'Tiempo de respuesta': '3 ms',
    };
    expect(parseScreen(map)).toEqual({
      screen_brightness_nits: 400,
      screen_touch: true,
      screen_color_gamut: '100% DCI-P3',
      screen_hdr: 'HDR 400',
      screen_response_ms: 3,
    });
  });

  it('detecta táctil dentro del tipo de pantalla y nits', () => {
    const map: Record<string, string> = {
      'Tipo de pantalla': 'OLED Táctil',
      Luminosidad: '500 nits',
    };
    const r = parseScreen(map);
    expect(r.screen_touch).toBe(true);
    expect(r.screen_brightness_nits).toBe(500);
  });

  it('devuelve nulls cuando no hay datos de pantalla', () => {
    expect(parseScreen({ Procesador: 'Intel Core i7', RAM: '16 GB' })).toEqual({
      screen_brightness_nits: null,
      screen_touch: null,
      screen_color_gamut: null,
      screen_hdr: null,
      screen_response_ms: null,
    });
  });

  it('ignora brillos fuera de rango', () => {
    expect(parseScreen({ Brillo: '5 cd/m²' }).screen_brightness_nits).toBeNull();
  });
});
