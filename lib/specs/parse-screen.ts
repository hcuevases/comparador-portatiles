// Parser puro de specs de pantalla a partir del mapa etiqueta→valor que extrae el
// scraper de la ficha de PcComponentes (mismo mapa que usa enrich-specs). Separado
// para poder testearlo sin red.
//
// Verificado contra ficha real (2026-06-11). Dos realidades del DOM:
//  - Layout VENDEDOR: TODA la pantalla va empaquetada en un campo "Pantalla", p.ej.
//    `16" QHD+ (2560x1600), 240Hz, OLED, VESA DisplayHDR™ True Black 600, 100% DCI-P3`.
//  - Layout FABRICANTE: filas <li> más granulares ("Tiempo de respuesta: 3 ms", etc.).
//  Por eso parseamos tanto etiquetas dedicadas como DENTRO del texto de pantalla.
//  OJO de no captar "HDR" de la fila WebCam → acotamos al campo de pantalla.

export type ScreenFields = {
  screen_brightness_nits: number | null;
  screen_touch: boolean | null; // true si se detecta táctil; null = desconocido (como ai_optimized)
  screen_color_gamut: string | null; // ej. "100% DCI-P3"
  screen_hdr: string | null; // ej. "HDR True Black 600" / "HDR" / "Dolby Vision"
  screen_response_ms: number | null;
};

function entries(map: Record<string, string>): [string, string][] {
  return Object.entries(map);
}

// Texto del campo de pantalla (donde el vendedor empaqueta todo). Excluye WebCam /
// cámara / teclado para no confundir su "HDR"/"táctil" con los de la pantalla.
function screenText(map: Record<string, string>): string {
  const parts: string[] = [];
  for (const [k, v] of entries(map)) {
    if (/pantalla|panel|display/i.test(k) && !/webcam|c[áa]mara|teclado|c[áa]m\b/i.test(k)) {
      parts.push(v);
    }
  }
  return parts.join(' · ');
}

// Concatena el campo de pantalla + valores de filas cuya etiqueta casa `labelRe`.
function scopeText(map: Record<string, string>, labelRe: RegExp): string {
  const extra = entries(map)
    .filter(([k]) => labelRe.test(k))
    .map(([, v]) => v);
  return [screenText(map), ...extra].join(' · ');
}

function parseBrightness(map: Record<string, string>): number | null {
  const hay = scopeText(map, /brillo|luminosidad|brightness/i);
  const m = hay.match(/(\d{2,4})\s*(?:cd\/m|nits)/i);
  if (m) {
    const n = Number(m[1]);
    if (n >= 100 && n <= 2000) return n; // rango razonable de un panel de portátil
  }
  return null;
}

function parseTouch(map: Record<string, string>): boolean | null {
  // Dentro del campo de pantalla o etiquetas dedicadas. \b no casa junto a vocales
  // acentuadas en JS, así que comparamos por inclusión.
  const hay = scopeText(map, /t[áa]ctil|touch|tipo.*pantalla/i).toLowerCase();
  if (/t[áa]ctil|touchscreen|touch screen/.test(hay)) return true;
  for (const [k, v] of entries(map)) {
    if (/t[áa]ctil|touch\s*screen/i.test(k)) {
      const val = v.trim().toLowerCase();
      if (val === 'no' || val.startsWith('no ')) return null;
      if (val.startsWith('sí') || val.startsWith('si') || val.includes('yes')) return true;
    }
  }
  return null;
}

function parseColorGamut(map: Record<string, string>): string | null {
  for (const [k, v] of entries(map)) {
    if (/gama de color|espacio de color|color gamut|cobertura.*color/i.test(k)) {
      return v.slice(0, 60);
    }
  }
  // Empaquetado en el campo de pantalla u otro valor: "100% DCI-P3", "45% NTSC".
  const m = scopeText(map, /^$/).match(/\d{2,3}\s*%\s*(?:sRGB|DCI-?P3|Adobe\s*RGB|NTSC)/i);
  return m ? m[0] : null;
}

function parseHdr(map: Record<string, string>): string | null {
  const hay = scopeText(map, /\bhdr\b|dolby/i);
  if (/dolby\s*vision/i.test(hay)) return 'Dolby Vision';
  // "VESA DisplayHDR™ True Black 600" / "DisplayHDR 400" / "HDR 500".
  const m = hay.match(/(?:VESA\s*)?(?:Display)?HDR(?:™)?\s*(?:True\s*Black\s*)?(\d{3,4})/i);
  if (m) {
    const tb = /true\s*black/i.test(m[0]) ? 'True Black ' : '';
    return `HDR ${tb}${m[1]}`.replace(/\s+/g, ' ').trim();
  }
  // HDR mencionado sin nivel (solo en el campo de pantalla, no WebCam).
  if (/\bHDR\b/i.test(screenText(map))) return 'HDR';
  return null;
}

function parseResponseMs(map: Record<string, string>): number | null {
  const hay = scopeText(map, /tiempo de respuesta|response time/i);
  const m = hay.match(/(\d{1,3})\s*ms\b/i);
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 60) return n; // rango razonable
  }
  return null;
}

export function parseScreen(map: Record<string, string>): ScreenFields {
  return {
    screen_brightness_nits: parseBrightness(map),
    screen_touch: parseTouch(map),
    screen_color_gamut: parseColorGamut(map),
    screen_hdr: parseHdr(map),
    screen_response_ms: parseResponseMs(map),
  };
}

export function hasScreenData(f: ScreenFields): boolean {
  return Object.values(f).some((v) => v !== null);
}
