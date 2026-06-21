import { describe, expect, it } from 'vitest';

import { buildSeriesChips, formatStorage } from './series-chips';

describe('formatStorage', () => {
  it('formatea GB y TB', () => {
    expect(formatStorage(512)).toBe('512 GB');
    expect(formatStorage(1024)).toBe('1 TB');
    expect(formatStorage(2048)).toBe('2 TB');
  });
});

describe('buildSeriesChips', () => {
  it('valor único cuando min === max', () => {
    const chips = buildSeriesChips({
      ramMin: 16, ramMax: 16, storageMin: 512, storageMax: 512,
      screenMin: 14, screenMax: 14, cpus: ['Intel Core i5-1335U'], repCpu: 'Intel Core i5-1335U',
    });
    expect(chips).toEqual(['Core i5-1335U', '16 GB RAM', '512 GB SSD', '14″']);
  });

  it('rangos cuando min !== max', () => {
    const chips = buildSeriesChips({
      ramMin: 16, ramMax: 64, storageMin: 512, storageMax: 2048,
      screenMin: 14, screenMax: 16, cpus: ['Intel Core i5-1335U', 'Intel Core i9-13900H'],
      repCpu: 'Intel Core i5-1335U',
    });
    expect(chips).toContain('16–64 GB RAM');
    expect(chips).toContain('512 GB–2 TB SSD');
    expect(chips).toContain('14–16″');
  });

  it('CPU: rango i5–i9 cuando misma familia Core iX', () => {
    const chips = buildSeriesChips({
      ramMin: 16, ramMax: 16, storageMin: 512, storageMax: 512, screenMin: 14, screenMax: 14,
      cpus: ['Intel Core i5-1335U', 'Intel Core i7-1355U', 'Intel Core i9-13900H'],
      repCpu: 'Intel Core i5-1335U',
    });
    expect(chips[0]).toBe('Core i5–i9');
  });

  it('CPU: cae al representante si las familias se mezclan', () => {
    const chips = buildSeriesChips({
      ramMin: 16, ramMax: 16, storageMin: 512, storageMax: 512, screenMin: 14, screenMax: 14,
      cpus: ['Intel Core i5-1335U', 'AMD Ryzen 7 7735U'], repCpu: 'Intel Core i5-1335U',
    });
    expect(chips[0]).toBe('Core i5-1335U');
  });

  it('omite chips de campos nulos', () => {
    const chips = buildSeriesChips({
      ramMin: null, ramMax: null, storageMin: null, storageMax: null,
      screenMin: null, screenMax: null, cpus: [], repCpu: null,
    });
    expect(chips).toEqual([]);
  });
});
