import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

// Configuraciones de una serie, para el expandir inline del grid. Reaplica los
// mismos filtros que la home (vienen en la query) para que la lista sea coherente.
export type SeriesConfigRow = {
  id: string;
  slug: string;
  brand: string;
  model: string;
  year: number | null;
  image_url: string | null;
  min_price: number | null;
  cpu: string | null;
  ram_gb: number | null;
  storage_gb: number | null;
  screen_inches: number | null;
};

const SCREEN_BUCKETS: Record<string, { min: number; max: number | null }> = {
  '13': { min: 12, max: 13.9 },
  '14': { min: 14, max: 14.9 },
  '15-16': { min: 15, max: 16.9 },
  '17': { min: 17, max: null },
};

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const p = url.searchParams;
  const brand = p.get('brand');
  const series = p.get('series');
  if (!brand || !series) {
    return NextResponse.json({ error: 'brand y series son obligatorios' }, { status: 400 });
  }

  const refurbished = p.get('cond') === 'nuevos' ? false : p.get('cond') === 'reacond' ? true : undefined;
  const screen = SCREEN_BUCKETS[p.get('screen') ?? ''];
  const ramMin = Number(p.get('ram_min')) || 0;
  const priceMax = Number(p.get('price_max')) || undefined;

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc('series_configs', {
      p_brand: brand,
      p_series_key: series,
      p_q: p.get('q')?.trim() || undefined,
      p_ram_min: ramMin,
      p_price_max: priceMax,
      p_gaming: p.get('gaming') === '1',
      p_ai: p.get('ai') === '1',
      p_oled: p.get('oled') === '1',
      p_refurbished: refurbished,
      p_screen_min: screen?.min,
      p_screen_max: screen?.max ?? undefined,
      p_product_line: p.get('line')?.trim() || undefined,
    })
    .returns<SeriesConfigRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ configs: data ?? [] });
}
