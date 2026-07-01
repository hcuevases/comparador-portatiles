import { Flame } from 'lucide-react';

import { createClient } from '@/lib/supabase/server';

import { HomeRow } from './home-row';
import { LaptopCardItem, type CardItem } from './laptop-card-item';

type DealRow = {
  id: string;
  slug: string;
  brand: string;
  model: string;
  image_url: string | null;
  current_price_eur: number | null;
  old_price_eur: number | null;
  drop_pct: number;
  ram_gb: number | null;
  cpu: string | null;
  screen_inches: number | null;
};

// Sección "Chollos": mayores bajadas de precio (RPC home_deals). Se auto-consulta y se
// oculta si no hay filas o la RPC falla (no fatal: la home sigue con el catálogo).
export async function DealsSection() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('home_deals', { p_limit: 12 }).returns<DealRow[]>();

  if (error || !data || data.length === 0) return null;

  return (
    <HomeRow
      title="Chollos"
      subtitle="Bajadas de precio recientes"
      icon={<Flame className="h-5 w-5 text-orange-500" aria-hidden />}
    >
      {data.map((d) => {
        const chips = [
          d.cpu,
          d.ram_gb != null ? `${d.ram_gb} GB` : null,
          d.screen_inches != null ? `${d.screen_inches}"` : null,
        ].filter((c): c is string => Boolean(c));
        const item: CardItem = {
          id: d.id,
          slug: d.slug,
          brand: d.brand,
          model: d.model,
          image_url: d.image_url,
          minPriceEur: d.current_price_eur,
          chips,
          dealPct: d.drop_pct,
          oldPriceEur: d.old_price_eur ?? undefined,
        };
        return <LaptopCardItem key={d.id} item={item} />;
      })}
    </HomeRow>
  );
}
