// Parsers puros de las páginas de componente de nanoreview. Reciben el mapa
// etiqueta→valor que extrae el scraper del DOM (tabla de specs + barras de
// benchmark) y devuelven los campos curados. Separado del script para poder
// testearlo con fixtures (ver parse-nanoreview.test.ts) sin tocar red.
//
// Etiquetas verificadas contra HTML real (2026-06-10):
//   CPU: "Geekbench 6 (Single-Core)"/"(Multi-Core)", "Total Cores", "TDP (PL1)",
//        "Released". Threads y la nota global 0-100 no se exponen como dato limpio.
//   GPU: benchmarks por nombre de test ("Time Spy", "Fire Strike"), "Memory Size",
//        "TGP".

export type CpuFields = {
  score: number | null;
  geekbench_single: number | null;
  geekbench_multi: number | null;
  cores: number | null;
  threads: number | null;
  tdp_w: number | null;
  release_year: number | null;
};

export type GpuFields = {
  score: number | null;
  g3dmark: number | null;
  vram_gb: number | null;
  tdp_w: number | null;
};

// Primer entero del valor cuya ETIQUETA casa `re`. Limpia separadores de millar
// ("12,296" / "12.296" → 12296).
export function firstNum(map: Record<string, string>, re: RegExp): number | null {
  for (const [k, v] of Object.entries(map)) {
    if (!re.test(k)) continue;
    const cleaned = v.replace(/[.,](?=\d{3}\b)/g, '');
    const m = cleaned.match(/\d+/);
    if (m) return Number(m[0]);
  }
  return null;
}

// Máximo entero del valor (rangos tipo "35-140 W" → 140; TDP/TGP suelen darse como
// rango configurable y el techo es lo representativo).
export function maxNum(map: Record<string, string>, re: RegExp): number | null {
  for (const [k, v] of Object.entries(map)) {
    if (!re.test(k)) continue;
    const nums = (v.match(/\d+/g) ?? []).map(Number);
    if (nums.length) return Math.max(...nums);
  }
  return null;
}

// Año a 4 dígitos ("January 3, 2023" → 2023).
export function yearOf(map: Record<string, string>, re: RegExp): number | null {
  for (const [k, v] of Object.entries(map)) {
    if (!re.test(k)) continue;
    const m = v.match(/\b(?:19|20)\d{2}\b/);
    if (m) return Number(m[0]);
  }
  return null;
}

export function parseCpu(map: Record<string, string>, score: number | null): CpuFields {
  return {
    score,
    // Exigir el paréntesis para NO casar "Geekbench 6 Multi / Watt" (eficiencia).
    geekbench_single: firstNum(map, /geekbench 6 \(single/i),
    geekbench_multi: firstNum(map, /geekbench 6 \(multi/i),
    cores: firstNum(map, /total cores/i) ?? firstNum(map, /^cores$/i),
    threads: firstNum(map, /^threads$/i),
    tdp_w: maxNum(map, /\btdp\b/i),
    release_year: yearOf(map, /released|release date/i),
  };
}

export function parseGpu(map: Record<string, string>, score: number | null): GpuFields {
  // nanoreview etiqueta los 3DMark por su test ("Time Spy", "Fire Strike"…). Time Spy
  // es el más citado para comparar GPU; fallback a Fire Strike / G3D Mark (PassMark).
  return {
    score,
    g3dmark:
      firstNum(map, /^time spy$/i) ?? firstNum(map, /^fire strike$/i) ?? firstNum(map, /g3d mark/i),
    vram_gb: firstNum(map, /memory size|\bvram\b/i),
    tdp_w: maxNum(map, /\btgp\b|\btdp\b/i),
  };
}

export function hasCpuData(f: CpuFields): boolean {
  return Object.values(f).some((v) => v !== null);
}
export function hasGpuData(f: GpuFields): boolean {
  return Object.values(f).some((v) => v !== null);
}
