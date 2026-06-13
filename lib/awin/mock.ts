// Feed CSV simulado para el modo --mock del conector de El Corte Inglés. Incluye una fila
// por cada EAN pedido (productos ya en catálogo → "attach"), más unas filas sintéticas para
// ejercitar el descubrimiento: productos nuevos (EAN no existente → "create") y un accesorio
// (→ "skip").

const HEADER = 'ean,search_price,aw_deep_link,in_stock,product_name,brand_name,merchant_category,merchant_image_url';

// Escapa las comillas dobles dentro de un campo CSV (RFC4180: " → "").
const q = (s: string): string => s.replace(/"/g, '""');

function row(ean: string, price: string, name: string, brand: string, cat: string): string {
  const url = `https://www.awin1.com/cread.php?awinmid=13075&awinaffid=PUBID&ued=https%3A%2F%2Fwww.elcorteingles.es%2Fp%2F${ean}`;
  return `${ean},${price},${url},1,"${q(name)}",${brand},"${q(cat)}",https://img.eci/${ean}.jpg`;
}

export function mockFeedCsv(eans: string[]): string {
  const existing = eans.map((ean, i) =>
    row(ean, (899 + i * 50).toFixed(2), `Portátil simulado (mock ECI ${i + 1})`, '', 'Informática > Portátiles'),
  );
  // Productos NUEVOS (EAN inventado, no en catálogo) → descubrimiento debería crearlos.
  const nuevos = [
    row('8400000000011', '749.00', 'Acer Aspire 3 A315-24P', 'Acer', 'Informática > Portátiles'),
    row('8400000000028', '1299.00', 'Portátil Lenovo IdeaPad Slim 5 16', 'Lenovo', 'Portátiles'),
  ];
  // Accesorio → descubrimiento debería saltarlo.
  const accesorio = [row('8400000000035', '19.99', 'Funda para portátil 15.6"', 'Acer', 'Accesorios')];
  // Sintéticos primero para que un --limit pequeño en la demo los alcance.
  return [HEADER, ...nuevos, ...accesorio, ...existing].join('\n');
}
