import { describe, expect, it } from 'vitest';

import { indexByEan, parseAwinFeed, parseCsv } from './parse-feed';

describe('parseCsv', () => {
  it('parsea campos entrecomillados con comas y comillas escapadas', () => {
    const csv = 'a,b,c\n1,"hola, mundo","con ""comillas"" dentro"\n2,x,y';
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual(['a', 'b', 'c']);
    expect(rows[1]).toEqual(['1', 'hola, mundo', 'con "comillas" dentro']);
    expect(rows[2]).toEqual(['2', 'x', 'y']);
  });

  it('tolera CRLF y última línea sin salto', () => {
    expect(parseCsv('a,b\r\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('parseAwinFeed', () => {
  const csv = [
    'ean,search_price,aw_deep_link,in_stock,product_name',
    '4711122334455,1199.00,https://www.awin1.com/cread.php?awinmid=13075&awinaffid=PUB&ued=https%3A%2F%2Feci%2Fa,1,"Portátil A"',
    '0000000000000,,https://www.awin1.com/cread.php?ued=b,0,"Sin precio"',
    ',999.00,https://x,1,"Sin EAN se descarta"',
  ].join('\n');

  it('mapea filas por cabecera y descarta las sin EAN', () => {
    const rows = parseAwinFeed(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      ean: '4711122334455',
      priceEur: 1199,
      url: 'https://www.awin1.com/cread.php?awinmid=13075&awinaffid=PUB&ued=https%3A%2F%2Feci%2Fa',
      inStock: true,
    });
    expect(rows[1]).toMatchObject({ ean: '0000000000000', priceEur: null, inStock: false });
  });

  it('devuelve [] si faltan columnas clave (ean o deeplink)', () => {
    expect(parseAwinFeed('foo,bar\n1,2')).toEqual([]);
  });
});

describe('indexByEan', () => {
  it('indexa por EAN', () => {
    const m = indexByEan(parseAwinFeed(
      'ean,search_price,aw_deep_link\n111,10.00,https://a\n222,20.00,https://b',
    ));
    expect(m.get('222')?.priceEur).toBe(20);
    expect(m.has('999')).toBe(false);
  });
});
