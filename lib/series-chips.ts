// Chips de specs para las cards de SERIE del grid. A diferencia de una card de una
// sola configuración, una serie agrega varias: los numéricos se muestran como rango
// (min–max) y el CPU como rango de familia "Core i5–i9" cuando todas las CPUs son
// Intel Core iX; si las familias se mezclan, cae al CPU del representante (la config
// más barata). Funciones puras y testeables.

export type SeriesChipInput = {
  ramMin: number | null;
  ramMax: number | null;
  storageMin: number | null;
  storageMax: number | null;
  screenMin: number | null;
  screenMax: number | null;
  cpus: string[];
  repCpu: string | null;
};

// 512 → "512 GB"; 1024 → "1 TB"; 2048 → "2 TB".
export function formatStorage(gb: number): string {
  return gb >= 1024 && gb % 1024 === 0 ? `${gb / 1024} TB` : `${gb} GB`;
}

// "Intel Core i7-1355U" → "Core i7-1355U" (quita el fabricante para que quepa).
export function shortCpu(cpu: string): string {
  return cpu.replace(/^(Intel|AMD|Apple)\s+/i, '').slice(0, 22);
}

// Nivel de un Intel Core iX: "Intel Core i7-1355U" → 7. null si no es Core iX.
function coreITier(cpu: string): number | null {
  const m = cpu.match(/core\s+i([3579])/i);
  return m ? Number(m[1]) : null;
}

function rangeNum(min: number, max: number, unit: string): string {
  return min === max ? `${min}${unit}` : `${min}–${max}${unit}`;
}

// "512 GB–2 TB SSD": el extremo bajo se muestra sin unidad solo cuando ambos
// extremos comparten unidad final.
function storageRange(min: number, max: number): string {
  if (min === max) return `${formatStorage(min)} SSD`;
  const lo = formatStorage(min);
  const hi = formatStorage(max);
  const loText = lo.split(' ')[1] === hi.split(' ')[1] ? lo.split(' ')[0] : lo;
  return `${loText}–${hi} SSD`;
}

function cpuChip(cpus: string[], repCpu: string | null): string | null {
  if (cpus.length <= 1) return repCpu ? shortCpu(repCpu) : null;
  const tiers = cpus.map(coreITier);
  if (tiers.every((t): t is number => t !== null)) {
    const min = Math.min(...tiers);
    const max = Math.max(...tiers);
    return min === max ? `Core i${min}` : `Core i${min}–i${max}`;
  }
  return repCpu ? shortCpu(repCpu) : null;
}

export function buildSeriesChips(input: SeriesChipInput): string[] {
  const chips: string[] = [];
  const cpu = cpuChip(input.cpus, input.repCpu);
  if (cpu) chips.push(cpu);
  if (input.ramMin !== null && input.ramMax !== null) {
    chips.push(rangeNum(input.ramMin, input.ramMax, ' GB RAM'));
  }
  if (input.storageMin !== null && input.storageMax !== null) {
    chips.push(storageRange(input.storageMin, input.storageMax));
  }
  if (input.screenMin !== null && input.screenMax !== null) {
    chips.push(rangeNum(input.screenMin, input.screenMax, '″'));
  }
  return chips;
}
