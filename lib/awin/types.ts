// Fila normalizada del feed de producto de Awin (El Corte Inglés) tras parsear el CSV.

export type AwinFeedRow = {
  ean: string;
  priceEur: number | null;
  url: string; // aw_deep_link: enlace de afiliado ya generado para tu cuenta
  inStock: boolean | null;
};
