// Fusiona los ids de selección local (este navegador) y de servidor (otro dispositivo):
// local primero, luego los del servidor que falten, sin duplicados, con tope `max`.
// Pura y testeable; la usa el hook al iniciar sesión.
export function mergeSelectionIds(localIds: string[], serverIds: string[], max: number): string[] {
  const out: string[] = [];
  for (const id of [...localIds, ...serverIds]) {
    if (out.length >= max) break;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}
