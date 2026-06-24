import { Star } from 'lucide-react';

import { createClient } from '@/lib/supabase/server';

import { HomeRow } from './home-row';
import { LaptopCardItem, type CardItem } from './laptop-card-item';

type FeaturedRow = {
  id: string;
  slug: string;
  brand: string;
  model: string;
  image_url: string | null;
  current_price_eur: number | null;
  ram_gb: number | null;
  cpu: string | null;
  screen_inches: number | null;
};

// Sección "Destacados": escaparate editorial (RPC home_featured). Se auto-consulta y se
// oculta si no hay curados o la RPC falla (no fatal).
export async function FeaturedSection() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('home_featured', { p_limit: 8 }).returns<FeaturedRow[]>();

  if (error || !data || data.length === 0) return null;

  return (
    <HomeRow title="Destacados" icon={<Star className="h-5 w-5 text-cyan-500" aria-hidden />}>
      {data.map((f) => {
        const chips = [
          f.cpu,
          f.ram_gb != null ? `${f.ram_gb} GB` : null,
          f.screen_inches != null ? `${f.screen_inches}"` : null,
        ].filter((c): c is string => Boolean(c));
        const item: CardItem = {
          id: f.id,
          slug: f.slug,
          brand: f.brand,
          model: f.model,
          image_url: f.image_url,
          minPriceEur: f.current_price_eur,
          chips,
        };
        return <LaptopCardItem key={f.id} item={item} />;
      })}
    </HomeRow>
  );
}
