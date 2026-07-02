// Guard anti precio-alto-erróneo: un precio nuevo que se dispara sobre la mediana reciente del
// portátil es basura (variante equivocada / MSRP sin-stock) y se descarta en la ingesta. Solo
// lado alto: las bajadas son rebajas reales y nunca se rechazan. Ver el spec y validar-precios.

export const HIGH_OUTLIER_FACTOR = 1.8;
export const MIN_HISTORY_FOR_GUARD = 3;

// Mediana de un array no vacío. Copia antes de ordenar (no muta la entrada); en longitud par
// promedia los dos valores centrales.
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// true si `newPrice` es un outlier ALTO respecto al histórico reciente. Con menos de
// MIN_HISTORY_FOR_GUARD precios recientes devuelve false (arranque en frío: no hay referencia).
export function isHighOutlier(
  newPrice: number,
  recentPrices: number[],
  factor: number = HIGH_OUTLIER_FACTOR,
): boolean {
  if (recentPrices.length < MIN_HISTORY_FOR_GUARD) return false;
  return newPrice > median(recentPrices) * factor;
}
