// Subconjunto de la respuesta de la Products API de Tradedoubler (MediaMarkt). Solo
// modelamos lo que leemos; todo opcional porque la API omite campos sin datos.

export type TdPrice = { value?: string | number; currency?: string };
export type TdImage = { url?: string };
export type TdIdentifiers = { ean?: string; sku?: string };
export type TdCategory = { name?: string };

export type TdProduct = {
  name?: string;
  productUrl?: string; // enlace YA trackeado (afiliado) — el que guardamos
  sourceProductUrl?: string; // enlace sin trackear del anunciante
  price?: TdPrice;
  productImage?: TdImage;
  identifiers?: TdIdentifiers;
  availability?: string; // texto libre del anunciante ("in stock", etc.)
  brand?: string; // para descubrimiento (parseBrandModel)
  categories?: TdCategory[]; // para descubrimiento (isLaptopProduct)
};

// `productHeader.totalHits` = total de resultados de la búsqueda (para paginar).
export type TdProductsResponse = { products?: TdProduct[]; productHeader?: { totalHits?: number } };
