// Validación de plausibilidad de un precio de portátil (EUR).
//
// PcComponentes (Algolia) devuelve a veces valores placeholder para items no disponibles
// (6.45, 9999, ~10005…) en el campo `price`. Sin validar, esos centinelas entraban en
// `prices_history` y rompían el "Desde X€" del catálogo y la detección de chollos. Se
// filtran en la ingesta tratándolos como "sin precio".
//
// Rango justificado con los datos (2026-06-24): p99 ≈ 5400 €; los workstations reales
// llegan a ~8700 €; el clúster centinela está en 9999/10005+ y el 6.45. [100, 9500] separa
// limpiamente lo real de la basura.
export const MIN_PLAUSIBLE_PRICE_EUR = 100;
export const MAX_PLAUSIBLE_PRICE_EUR = 9500;

export function isPlausiblePrice(value: number | null | undefined): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_PLAUSIBLE_PRICE_EUR &&
    value <= MAX_PLAUSIBLE_PRICE_EUR
  );
}

// Devuelve el precio si es plausible, o null (para tratarlo como "sin precio" en la ingesta).
export function sanePrice(value: number | null | undefined): number | null {
  return isPlausiblePrice(value) ? value : null;
}
