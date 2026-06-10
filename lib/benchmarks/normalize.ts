// Extrae el MODELO concreto de CPU/GPU y lo normaliza a una clave canónica para
// casar con nanoreview. El modelo de CPU NO está en specs.cpu (eso es la familia de
// Algolia: "Intel Core Ultra 7"), sino en el NOMBRE del portátil (laptops.model), que
// lo trae en ~73% de los casos. La GPU dedicada sí viene en specs.gpu.
//
// La clave es vendor-prefijada al estilo de las URLs de nanoreview
// (intel-core-i7-13620h, amd-ryzen-ai-7-350, apple-m4-pro). El scraper resuelve el
// slug exacto a partir de la clave; los desajustes se corrigen en benchmark_overrides.
//
// Funciones puras (sin red, sin estado) → unit-testeables. Ver normalize.test.ts.

/**
 * Modelo de CPU a partir del nombre del portátil. `family` (specs.cpu) se usa solo
 * para Apple (las M-series llegan como familia, p.ej. "M4 Pro"). Devuelve `null` si
 * el nombre no contiene un modelo reconocible (la familia sola no basta para casar).
 */
export function extractCpuKey(name: string, family: string | null): string | null {
  // Apple: la M-series viene en la familia ("M4 Pro"), no como modelo numerado. Se
  // resuelve desde la familia para no confundir "M.2 SSD"/códigos del nombre con un chip.
  const fam = (family ?? '').trim();
  const apple = fam.match(/^M([1-5])(?:\s+(Pro|Max|Ultra))?\b/i);
  if (apple) return `apple-m${apple[1]}${apple[2] ? `-${apple[2].toLowerCase()}` : ''}`;

  // Intel Core i3/i5/i7/i9 con modelo "iN-NNNNN[letras]".
  let m = name.match(/Core\s+i([3579])-(\d{3,5})([A-Za-z]*)/i);
  if (m) return `intel-core-i${m[1]}-${m[2]}${m[3].toLowerCase()}`;

  // Intel Core Ultra 5/7/9 "Ultra N NNN[letra]".
  m = name.match(/Core\s+Ultra\s+([579])\s+(\d{3})([A-Za-z]*)/i);
  if (m) return `intel-core-ultra-${m[1]}-${m[2]}${m[3].toLowerCase()}`;

  // Intel Core 3/5/7/9 (nomenclatura nueva sin "i" ni "Ultra"): "Core N NNN[letra]".
  m = name.match(/Core\s+([3579])\s+(\d{3})([A-Za-z]*)/i);
  if (m) return `intel-core-${m[1]}-${m[2]}${m[3].toLowerCase()}`;

  // AMD Ryzen [AI] 3/5/7/9 "Ryzen [AI ]N NNNN[letras]".
  m = name.match(/Ryzen\s+(AI\s+)?([3579])\s+(\d{3,4})([A-Za-z]*)/i);
  if (m) {
    const ai = m[1] ? 'ai-' : '';
    return `amd-ryzen-${ai}${m[2]}-${m[3]}${m[4].toLowerCase()}`;
  }

  // Qualcomm Snapdragon X (Elite|Plus).
  m = name.match(/Snapdragon\s+X(?:\s+(Elite|Plus))?/i);
  if (m) return `qualcomm-snapdragon-x${m[1] ? `-${m[1].toLowerCase()}` : ''}`;

  return null;
}

/**
 * Modelo de GPU DEDICADA a partir de specs.gpu (con el nombre como respaldo).
 * Devuelve `null` para integradas (Gráfica Integrada, Apple GPU, Iris/UHD, Radeon
 * Graphics) — no tienen benchmark dedicado en nanoreview.
 */
export function extractGpuKey(gpuRaw: string | null, name: string): string | null {
  const g = (gpuRaw ?? '').trim();
  const haystack = g || name;
  if (!g) return null;

  // Integradas / sin GPU dedicada → sin benchmark.
  if (/integrad|integrated|apple\s*gpu|iris|\buhd\b|radeon\s+graphics$/i.test(g)) {
    return null;
  }

  // NVIDIA GeForce/Quadro RTX NNNN [Ti] → mobile (sufijo -laptop en nanoreview).
  let m = haystack.match(/RTX\s+(\d{3,4})(\s*Ti)?/i);
  if (m) return `rtx-${m[1]}${m[2] ? '-ti' : ''}-laptop`;

  // AMD Radeon RX NNNN[S/M].
  m = haystack.match(/Radeon\s+RX\s+(\d{3,4}[A-Za-z]*)/i);
  if (m) return `radeon-rx-${m[1].toLowerCase()}`;

  // Intel Arc ANNN[M].
  m = haystack.match(/Arc\s+(A\d{3,4}[A-Za-z]*)/i);
  if (m) return `arc-${m[1].toLowerCase()}`;

  return null;
}
