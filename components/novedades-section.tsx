import { Sparkles } from 'lucide-react';

import { createClient } from '@/lib/supabase/server';

import { HomeRow } from './home-row';
import { LaptopCardItem, type CardItem } from './laptop-card-item';

type NovedadRow = {
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

// Sección "Novedades": recién añadidos al catálogo (RPC home_novedades, uno por marca).
// Se auto-consulta y se oculta si no hay filas o la RPC falla (no fatal).
export async function NovedadesSection() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('home_novedades', { p_limit: 12 }).returns<NovedadRow[]>();

  if (error || !data || data.length === 0) return null;

  return (
    <HomeRow
      title="Novedades"
      subtitle="Recién añadidos"
      icon={<Sparkles className="h-5 w-5 text-emerald-500" aria-hidden />}
    >
      {data.map((n) => {
        const chips = [
          n.cpu,
          n.ram_gb != null ? `${n.ram_gb} GB` : null,
          n.screen_inches != null ? `${n.screen_inches}"` : null,
        ].filter((c): c is string => Boolean(c));
        const item: CardItem = {
          id: n.id,
          slug: n.slug,
          brand: n.brand,
          model: n.model,
          image_url: n.image_url,
          minPriceEur: n.current_price_eur,
          chips,
        };
        return <LaptopCardItem key={n.id} item={item} />;
      })}
    </HomeRow>
  );
}
