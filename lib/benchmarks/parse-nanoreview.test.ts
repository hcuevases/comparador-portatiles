import { describe, expect, it } from 'vitest';

import { parseCpu, parseGpu } from './parse-nanoreview';

// Fixtures construidas con etiquetas/valores REALES capturados de nanoreview
// (--dump, 2026-06-10). Si nanoreview cambia su DOM, estos tests cazan la regresión.

describe('parseCpu', () => {
  it('extrae los campos curados de un mapa real (i7-13620H)', () => {
    const map: Record<string, string> = {
      'Geekbench 6 (Single-Core)': '2,494',
      'Geekbench 6 (Multi-Core)': '12,296',
      'Geekbench 6 Multi / Watt': '273.2 PPW', // eficiencia: NO debe colarse
      'Total Cores': '10',
      'P-Cores': '6',
      'TDP (PL1)': '35-45 W (configurable)',
      Released: 'January 3, 2023',
    };
    expect(parseCpu(map, null)).toEqual({
      score: null,
      geekbench_single: 2494,
      geekbench_multi: 12296,
      cores: 10, // "Total Cores", no "P-Cores"
      threads: null, // nanoreview no lo expone como fila
      tdp_w: 45, // techo del rango "35-45"
      release_year: 2023, // año de "January 3, 2023", no el día
    });
  });

  it('devuelve nulls si faltan las etiquetas', () => {
    expect(parseCpu({ Foo: 'bar' }, null)).toEqual({
      score: null,
      geekbench_single: null,
      geekbench_multi: null,
      cores: null,
      threads: null,
      tdp_w: null,
      release_year: null,
    });
  });
});

describe('parseGpu', () => {
  it('extrae los campos curados de un mapa real (RTX 4060 mobile)', () => {
    const map: Record<string, string> = {
      'Time Spy': '10,000',
      'Fire Strike': '25,000',
      'Memory Size': '8 GB',
      TGP: '35-140 W (configurable)',
    };
    expect(parseGpu(map, null)).toEqual({
      score: null,
      g3dmark: 10000, // prefiere Time Spy
      vram_gb: 8,
      tdp_w: 140, // techo del rango TGP
    });
  });

  it('usa Fire Strike si no hay Time Spy', () => {
    const map: Record<string, string> = { 'Fire Strike': '18,500', 'Memory Size': '6 GB' };
    expect(parseGpu(map, null).g3dmark).toBe(18500);
  });
});
