// Parser puro de specs de pantalla a partir del mapa etiqueta→valor que extrae el
// scraper de la ficha de PcComponentes (mismo mapa que usa enrich-specs). Separado
// para poder testearlo sin red.
//
// OJO: las etiquetas concretas NO se han podido verificar contra la ficha real (está
// tras Cloudflare ahora mismo). Los patrones se basan en el vocabulario habitual de
// las fichas (tabla del vendedor + lista del fabricante, en español). Al recuperar
// acceso a la ficha, validar con `enrich-specs --dry-run` y ajustar los regex (los
// tests de fixture cazan regresiones).

export type ScreenFields = {
  screen_brightness_nits: number | null;
  screen_touch: boolean | null; // true si se detecta táctil; null = desconocido (como ai_optimized)
  screen_color_gamut: string | null; // ej. "100% DCI-P3"
  screen_hdr: string | null; // ej. "HDR 400" / "HDR"
  screen_response_ms: number | null;
};

function entries(map: Record<string, string>): [string, string][] {
  return Object.entries(map);
}

// Brillo en nits: valor con "NNN cd/m²" o "NNN nits" en una fila de pantalla/brillo.
function parseBrightness(map: Record<string, string>): number | null {
  for (const [k, v] of entries(map)) {
    if (!/brillo|luminosidad|brightness|nits|cd\/m/i.test(k) && !/cd\/m|nits/i.test(v)) continue;
    const m = v.match(/(\d{2,4})\s*(?:cd\/m|nits)/i);
    if (m) {
      const n = Number(m[1]);
      if (n >= 100 && n <= 2000) return n; // rango razonable de un panel de portátil
    }
  }
  return null;
}

// Táctil: clave/valor lo menciona afirmativamente. Solo true|null (no guardamos false:
// "no mencionado" no implica "no táctil"). Coherente con ai_optimized.
function parseTouch(map: Record<string, string>): boolean | null {
  // OJO: \b no funciona junto a vocales acentuadas en JS (son no-ASCII), así que
  // "Sí" no casaría con /s[íi]\b/. Normalizamos y comparamos por prefijo/inclusión.
  for (const [k, v] of entries(map)) {
    const val = v.trim().toLowerCase();
    if (/t[áa]ctil|touch\s*screen|pantalla t[áa]ctil/i.test(k)) {
      if (val === 'no' || val.startsWith('no ')) return null;
      if (val.startsWith('sí') || val.startsWith('si') || val.includes('yes') || /t[áa]ctil/.test(val))
        return true;
    }
    // valor que dice "Táctil" dentro del tipo de pantalla
    if (/tipo.*pantalla|panel/i.test(k) && /t[áa]ctil/i.test(v)) return true;
  }
  return null;
}

// Gama de color: devuelve el texto del valor (ej. "100% DCI-P3", "45% NTSC").
function parseColorGamut(map: Record<string, string>): string | null {
  for (const [k, v] of entries(map)) {
    if (/gama de color|espacio de color|color gamut|cobertura.*color/i.test(k)) {
      return v.slice(0, 60);
    }
    // a veces va en el valor sin etiqueta dedicada
    const m = v.match(/\d{2,3}\s*%\s*(?:sRGB|DCI-?P3|Adobe\s*RGB|NTSC)/i);
    if (m) return m[0];
  }
  return null;
}

// HDR: etiqueta o valor que lo menciona → texto normalizado ("HDR 400" / "HDR").
function parseHdr(map: Record<string, string>): string | null {
  for (const [k, v] of entries(map)) {
    const hay = `${k} ${v}`;
    const m = hay.match(/HDR\s*\d{3,4}|Dolby\s*Vision/i);
    if (m) return m[0].replace(/\s+/g, ' ');
    if (/\bHDR\b/i.test(k) && /s[íi]\b|yes|compatible/i.test(v)) return 'HDR';
  }
  return null;
}

// Tiempo de respuesta en ms ("3 ms").
function parseResponseMs(map: Record<string, string>): number | null {
  for (const [k, v] of entries(map)) {
    if (!/tiempo de respuesta|response time/i.test(k)) continue;
    const m = v.match(/(\d{1,3})\s*ms/i);
    if (m) return Number(m[1]);
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
