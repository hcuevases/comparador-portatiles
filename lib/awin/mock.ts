// Feed CSV simulado para el modo --mock del conector de El Corte Inglés. Genera una fila por
// cada EAN pedido para que el cruce los case.

export function mockFeedCsv(eans: string[]): string {
  const header = 'ean,search_price,aw_deep_link,in_stock,product_name';
  const rows = eans.map((ean, i) => {
    const price = (899 + i * 50).toFixed(2);
    const url = `https://www.awin1.com/cread.php?awinmid=13075&awinaffid=PUBID&ued=https%3A%2F%2Fwww.elcorteingles.es%2Fp%2F${ean}`;
    return `${ean},${price},${url},1,"Portátil simulado (mock ECI ${i + 1})"`;
  });
  return [header, ...rows].join('\n');
}
