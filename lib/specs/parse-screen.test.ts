import { describe, expect, it } from 'vitest';

import { parseScreen } from './parse-screen';

// Fixtures con valores REALES de la ficha de PcComponentes (vendedor + fabricante),
// verificados con --dry-run el 2026-06-11. Fijan el comportamiento ante cambios.

describe('parseScreen', () => {
  it('extrae del campo "Pantalla" empaquetado (layout vendedor) sin falso positivo de WebCam', () => {
    const map: Record<string, string> = {
      Pantalla: '16" QHD+ (2560x1600), 240Hz, OLED, VESA DisplayHDR™ True Black 600, 100% DCI-P3',
      WebCam: 'IR FHD (30fps@1080p) con HDR, 3D Noise Reduction', // su "HDR" NO debe colarse
    };
    expect(parseScreen(map)).toEqual({
      screen_brightness_nits: null, // "True Black 600" es HDR, no nits
      screen_touch: null,
      screen_color_gamut: '100% DCI-P3',
      screen_hdr: 'HDR True Black 600',
      screen_response_ms: null,
    });
  });


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
