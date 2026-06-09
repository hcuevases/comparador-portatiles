import { createClient } from '@supabase/supabase-js';
import { tool, type UIToolInvocation } from 'ai';
import { z } from 'zod';

import type { Database, Tables } from '@/lib/supabase/database.types';

// Cliente anónimo (lectura pública del catálogo vía RLS). Las tools solo leen, no
// necesitan cookies de sesión ni el service role. Igual que el resto del sitio.
function catalogClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / ANON_KEY');
  return createClient<Database>(url, anon, {
    auth: { persistSession: false },
  });
}

// Lo que devuelve search_laptops (ver db/migrations/0018). Mismo shape que la home.
type SearchRow = {
  id: string;
  slug: string;
  brand: string;
  model: string;
  year: number | null;
  image_url: string | null;
  min_price: number | null;
  total_count: number;
};

type SpecRow = Pick<
  Tables<'specs'>,
  | 'laptop_id'
  | 'cpu'
  | 'cpu_cores'
  | 'ram_gb'
  | 'storage_gb'
  | 'gpu'
  | 'gpu_vram_gb'
  | 'screen_inches'
  | 'screen_refresh_hz'
  | 'weight_kg'
  | 'battery_wh'
  | 'ports'
>;

// Specs que ve el modelo por cada resultado. Las 5 primeras coinciden con las que
// pinta la tarjeta (LaptopCard); las enriquecidas (refresh, VRAM, batería…) las usa el
// modelo para justificar/comparar, aunque la tarjeta no las muestre.
type RecoSpecs = Pick<
  SpecRow,
  | 'cpu'
  | 'cpu_cores'
  | 'ram_gb'
  | 'storage_gb'
  | 'gpu'
  | 'gpu_vram_gb'
  | 'screen_inches'
  | 'screen_refresh_hz'
  | 'weight_kg'
  | 'battery_wh'
  | 'ports'
>;

// Forma compacta que ve el modelo Y que la UI usa para pintar tarjetas. Incluye `id`
// para que la tarjeta y la selección de comparar funcionen.
export type RecoLaptop = {
  id: string;
  slug: string;
  brand: string;
  model: string;
  year: number | null;
  image_url: string | null;
  minPriceEur: number | null;
  specs: RecoSpecs | null;
};

function escapeIlike(input: string): string {
  return input.replace(/[%_\\]/g, (m) => `\\${m}`);
}

export const buscarPortatiles = tool({
  description:
    'Busca portátiles REALES del catálogo según las necesidades del usuario. Devuelve modelos con su precio ACTUAL y specs clave. Úsala SIEMPRE antes de recomendar — no inventes modelos ni precios. Combina los filtros que apliquen.',
  inputSchema: z.object({
    q: z.string().optional().describe('Texto libre: marca, modelo o serie (ej: "ThinkPad", "MacBook Air").'),
    brands: z.array(z.string()).optional().describe('Marcas exactas (ej: ["Lenovo","HP"]).'),
    ram_min: z.number().int().optional().describe('RAM mínima en GB (ej: 16).'),
    price_max: z.number().optional().describe('Precio máximo en euros.'),
    gaming: z.boolean().optional().describe('Solo portátiles gaming.'),
    ai: z.boolean().optional().describe('Solo optimizados para IA.'),
    oled: z.boolean().optional().describe('Solo pantalla OLED/AMOLED.'),
    refurbished: z
      .boolean()
      .optional()
      .describe(
        'Filtro de reacondicionado: true = SOLO reacondicionados; false = SOLO nuevos (excluye reacondicionados); omitir = ambos. Si el usuario pide un portátil "nuevo" o "sin estrenar", usa false.',
      ),
    screen_min: z.number().optional().describe('Pulgadas mínimas de pantalla.'),
    screen_max: z.number().optional().describe('Pulgadas máximas (ej: 14 para algo ligero/pequeño).'),
    refresh_min: z
      .number()
      .int()
      .optional()
      .describe('Tasa de refresco mínima en Hz (ej: 144 para gaming fluido).'),
    weight_max: z.number().optional().describe('Peso máximo en kg (ej: 1.4 para ultraligero).'),
    vram_min: z.number().int().optional().describe('VRAM mínima de la GPU dedicada en GB (ej: 8).'),
    battery_min: z.number().optional().describe('Capacidad mínima de batería en Wh (ej: 70 para buena autonomía).'),
    sort: z.enum(['price_asc', 'price_desc']).optional().describe('Ordenar por precio.'),
    limit: z.number().int().min(1).max(8).default(6).describe('Cuántos devolver (máx 8).'),
  }),
  execute: async (args): Promise<{ count: number; laptops: RecoLaptop[] }> => {
    const supabase = catalogClient();
    const { data: rows, error } = await supabase
      .rpc('search_laptops', {
        p_q: args.q ? escapeIlike(args.q) : undefined,
        p_brands: args.brands && args.brands.length > 0 ? args.brands : undefined,
        p_ram_min: args.ram_min ?? 0,
        p_price_max: args.price_max,
        p_gaming: args.gaming ?? false,
        p_ai: args.ai ?? false,
        p_oled: args.oled ?? false,
        // tri-estado: undefined → todos, true → solo reacond, false → solo nuevos.
        p_refurbished: args.refurbished,
        p_screen_min: args.screen_min,
        p_screen_max: args.screen_max,
        p_refresh_min: args.refresh_min,
        p_weight_max: args.weight_max,
        p_vram_min: args.vram_min,
        p_battery_min: args.battery_min,
        p_sort: args.sort,
        p_limit: args.limit,
        p_offset: 0,
      })
      .returns<SearchRow[]>();

    if (error) return { count: 0, laptops: [] };
    const laptops = rows ?? [];
    const ids = laptops.map((l) => l.id);

    const { data: specsData } = await supabase
      .from('specs')
      .select(
        'laptop_id, cpu, cpu_cores, ram_gb, storage_gb, gpu, gpu_vram_gb, screen_inches, screen_refresh_hz, weight_kg, battery_wh, ports',
      )
      .in('laptop_id', ids)
      .returns<SpecRow[]>();
    const specsByLaptop = new Map((specsData ?? []).map((s) => [s.laptop_id, s] as const));

    const total = laptops.length > 0 ? laptops[0].total_count : 0;
    return {
      count: total,
      laptops: laptops.map((l) => {
        const s = specsByLaptop.get(l.id) ?? null;
        return {
          id: l.id,
          slug: l.slug,
          brand: l.brand,
          model: l.model,
          year: l.year,
          image_url: l.image_url,
          minPriceEur: l.min_price,
          specs: s
            ? {
                cpu: s.cpu,
                cpu_cores: s.cpu_cores,
                ram_gb: s.ram_gb,
                storage_gb: s.storage_gb,
                gpu: s.gpu,
                gpu_vram_gb: s.gpu_vram_gb,
                screen_inches: s.screen_inches,
                screen_refresh_hz: s.screen_refresh_hz,
                weight_kg: s.weight_kg,
                battery_wh: s.battery_wh,
                ports: s.ports,
              }
            : null,
        };
      }),
    };
  },
});

export const detallePortatil = tool({
  description:
    'Devuelve la ficha COMPLETA de un portátil (todas las specs + precio actual) por su slug. Úsala cuando el usuario pregunte por un modelo concreto o necesites detalles para comparar/justificar.',
  inputSchema: z.object({
    slug: z.string().describe('El slug del portátil (lo devuelve buscarPortatiles).'),
  }),
  execute: async ({ slug }) => {
    const supabase = catalogClient();
    const { data: laptop } = await supabase
      .from('laptops')
      .select('id, brand, model, year, slug, refurbished')
      .eq('slug', slug)
      .maybeSingle();
    if (!laptop) return { encontrado: false as const };

    const [{ data: spec }, { data: prices }] = await Promise.all([
      supabase.from('specs').select('*').eq('laptop_id', laptop.id).maybeSingle(),
      supabase
        .rpc('current_min_prices', { p_ids: [laptop.id] })
        .returns<{ laptop_id: string; min_price: number }[]>(),
    ]);

    return {
      encontrado: true as const,
      slug: laptop.slug,
      brand: laptop.brand,
      model: laptop.model,
      year: laptop.year,
      refurbished: laptop.refurbished,
      minPriceEur: prices && prices.length > 0 ? Number(prices[0].min_price) : null,
      specs: spec ?? null,
    };
  },
});

export type BuscarPortatilesInvocation = UIToolInvocation<typeof buscarPortatiles>;
