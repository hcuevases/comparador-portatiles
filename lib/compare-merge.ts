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

// Reordena `items` según `ids` y DESCARTA los ids cuyo item no existe (p.ej. una laptop
// borrada por el dedup). Mantiene el orden de `ids`. Genérica sobre cualquier objeto con
// `id`; la usa el hook para podar del carrito las laptops que ya no están en BD.
export function orderByIds<T extends { id: string }>(ids: string[], items: T[]): T[] {
  const byId = new Map(items.map((i) => [i.id, i] as const));
  return ids.map((id) => byId.get(id)).filter((x): x is T => x !== undefined);
}
