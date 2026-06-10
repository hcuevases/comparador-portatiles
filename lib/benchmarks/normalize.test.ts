import { describe, expect, it } from 'vitest';

import { extractCpuKey, extractGpuKey } from './normalize';

// Casos derivados de nombres REALES del catálogo (laptops.model) y de specs.gpu.
// La clave es canónica (vendor-prefijada para CPU, estilo nanoreview); el scraper
// resuelve el slug exacto y los desajustes van a benchmark_overrides.

describe('extractCpuKey', () => {
  const cases: [name: string, family: string | null, expected: string | null][] = [
    ['Cyborg 15 A13VF-879XES Intel Core i7-13620H/32GB/1TB SSD/RTX 4060', 'Intel Core I7', 'intel-core-i7-13620h'],
    ['Katana 17 HX B14WFK-082XES 17.3" Intel Core i9-14900HX 32GB', 'Intel Core i9', 'intel-core-i9-14900hx'],
    ['Modern 15 F13MG-698XFR 15,6" Intel Core i3-1315U 16GB', 'Intel Core I3', 'intel-core-i3-1315u'],
    ['Stealth 16 AI A2HWFG-070FR 16" Intel Core Ultra 7 255H 32GB', 'Intel Core Ultra 7', 'intel-core-ultra-7-255h'],
    ['Galaxy Book5 360 AMOLED Intel Core Ultra 5 226V/16GB/512GB SSD', 'Intel Core Ultra 5', 'intel-core-ultra-5-226v'],
    ['Vector 16 HX AI A2XWHG-241ES Intel Core Ultra 9 275HX/32GB', 'Intel Core Ultra 9', 'intel-core-ultra-9-275hx'],
    ['Modern 15 F1MG-204ES 15.6" Intel Core 7 150U 16GB 512GB SSD', 'Intel Core 7', 'intel-core-7-150u'],
    ['Yoga Slim 7 14AKP10 14" AMD Ryzen AI 7 350 32GB Radeon 860M', 'AMD Ryzen AI 7', 'amd-ryzen-ai-7-350'],
    ['Cyborg A15 AI B2HWFKG-094XES 15.6" AMD Ryzen 9 270 64GB', 'AMD Ryzen 9', 'amd-ryzen-9-270'],
    ['Surface Pro 11 Copilot+ PC Snapdragon X Elite 13" 16GB', 'Qualcomm', 'qualcomm-snapdragon-x-elite'],
    ['Surface Laptop Copilot+ PC Snapdragon X Plus 16GB 256GB', 'Qualcomm', 'qualcomm-snapdragon-x-plus'],
    ['MacBook Pro 14 M4 Pro 24GB 512GB SSD', 'M4 Pro', 'apple-m4-pro'],
    ['MacBook Air 13 M3 16GB 256GB SSD', 'M3', 'apple-m3'],
    ['MacBook Pro 16 M5 Max 48GB', 'M5 Max', 'apple-m5-max'],
    // Sin modelo concreto en el nombre → null (la familia sola no sirve).
    ['ThinkPad T14 Gen 1 14" Intel Core i5 16GB 512GB SSD', 'Intel Core I5', null],
    ['ThinkPad E14 Gen 7 14" AMD Ryzen 5 16GB Radeon 760M', 'AMD Ryzen 5', null],
    // "M.2 SSD" / códigos con M no deben confundirse con Apple.
    ['Nitro V15 Intel Core i5 con M.2 SSD 1TB', 'Intel Core I5', null],
  ];

  it.each(cases)('extractCpuKey(%j, %j) → %j', (name, family, expected) => {
    expect(extractCpuKey(name, family)).toBe(expected);
  });
});

describe('extractGpuKey', () => {
  const cases: [gpu: string | null, name: string, expected: string | null][] = [
    ['GeForce RTX 5060', 'MSI Stealth RTX 5060', 'rtx-5060-laptop'],
    ['GeForce RTX 4060', 'Cyborg 15 RTX 4060', 'rtx-4060-laptop'],
    ['GeForce RTX 5070 Ti', 'Raider RTX 5070 Ti', 'rtx-5070-ti-laptop'],
    ['AMD Radeon RX 7600S', 'ProArt RX 7600S', 'radeon-rx-7600s'],
    ['Intel Arc A370M', 'Vivobook Arc', 'arc-a370m'],
    ['Gráfica Integrada', 'ThinkPad T14 Intel Core i5', null],
    ['Apple GPU Deca Core', 'MacBook Pro M4 Pro', null],
    ['AMD Radeon Graphics', 'Yoga Ryzen 5', null],
    [null, 'Portátil sin gpu', null],
  ];

  it.each(cases)('extractGpuKey(%j, %j) → %j', (gpu, name, expected) => {
    expect(extractGpuKey(gpu, name)).toBe(expected);
  });
});
