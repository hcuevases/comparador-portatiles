// Tipos del subconjunto de la Product Advertising API 5.0 (PA-API) que consumimos.
// Solo modelamos lo que leemos; el resto del payload se ignora. Todo opcional porque
// PA-API omite campos cuando no hay datos (p.ej. un item sin oferta no trae Offers).

export type PaapiPrice = {
  Amount?: number;
  Currency?: string;
  DisplayAmount?: string;
};

export type PaapiAvailability = {
  Type?: string; // 'Now' = en stock
  Message?: string;
};

export type PaapiListing = {
  Price?: PaapiPrice;
  Availability?: PaapiAvailability;
};

export type PaapiOffers = {
  Listings?: PaapiListing[];
};

export type PaapiExternalIds = {
  EANs?: { DisplayValues?: string[] };
  UPCs?: { DisplayValues?: string[] };
};

export type PaapiItemInfo = {
  Title?: { DisplayValue?: string };
  ExternalIds?: PaapiExternalIds;
};

export type PaapiItem = {
  ASIN?: string;
  DetailPageURL?: string; // ya incluye el PartnerTag (?tag=...): es el enlace de afiliado
  Offers?: PaapiOffers;
  ItemInfo?: PaapiItemInfo;
};

export type PaapiError = { Code?: string; Message?: string };

export type PaapiResponse = {
  ItemsResult?: { Items?: PaapiItem[] }; // respuesta de GetItems
  SearchResult?: { Items?: PaapiItem[] }; // respuesta de SearchItems
  Errors?: PaapiError[];
};

// Forma normalizada que el conector escribe en affiliate_links / prices_history.
export type MappedOffer = {
  asin: string;
  priceEur: number | null; // null si la oferta no está en EUR o no hay precio
  currency: string | null;
  url: string; // DetailPageURL (enlace de afiliado)
  inStock: boolean | null;
};
