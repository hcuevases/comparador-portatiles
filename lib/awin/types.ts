// Fila normalizada del feed de producto de Awin (El Corte Inglés) tras parsear el CSV.

export type AwinFeedRow = {
  ean: string;
  priceEur: number | null;
  url: string; // aw_deep_link: enlace de afiliado ya generado para tu cuenta
  inStock: boolean | null;
  // Campos para el modo descubrimiento (crear laptops nuevos). Solo se rellenan si el
  // feed trae esas columnas; si no, quedan null.
  name: string | null;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
};
