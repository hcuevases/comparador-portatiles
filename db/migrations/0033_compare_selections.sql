-- 0033_compare_selections.sql
-- Sincroniza la selección de "comparar" (carrito efímero de ≤4 portátiles) entre
-- dispositivos para usuarios logueados. Una fila por usuario; el carrito anónimo sigue
-- viviendo solo en localStorage (cliente). RLS dueño-only (mismo patrón que comparisons
-- / price_alerts). Cascade on delete desde auth.users: borrar la cuenta (GDPR) elimina
-- la selección. Se guardan solo ids; el display (marca/modelo/imagen) se hidrata desde
-- `laptops` en cliente.

create table if not exists public.compare_selections (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  laptop_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.compare_selections enable row level security;

drop policy if exists "owner reads own compare selection" on public.compare_selections;
create policy "owner reads own compare selection"
  on public.compare_selections for select
  using (auth.uid() = user_id);

drop policy if exists "owner writes own compare selection" on public.compare_selections;
create policy "owner writes own compare selection"
  on public.compare_selections for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
