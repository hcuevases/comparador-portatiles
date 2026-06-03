-- 0016_price_alerts.sql
-- Alertas de bajada de precio: el usuario se suscribe a un modelo y se le avisa
-- por email cuando el precio baja del precio que tenía al suscribirse.
--
-- baseline_price_eur: precio (mínimo entre retailers) en el momento de crear la
--   alerta. Es la referencia: avisamos cuando el actual baja por debajo.
-- last_notified_price_eur: último precio por el que ya se notificó (null = nunca).
--   Evita spamear: solo se reenvía si baja AÚN MÁS que la última vez notificada.
--
-- RLS dueño-only (mismo patrón que `comparisons`). El cron de detección corre con
-- service role y omite RLS para leer todas las alertas y actualizar last_notified.
-- Cascade on delete desde auth.users y laptops: borrar la cuenta (GDPR) o el
-- portátil elimina sus alertas.

create table if not exists public.price_alerts (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users(id) on delete cascade,
  laptop_id                uuid not null references public.laptops(id) on delete cascade,
  baseline_price_eur       numeric(10,2) not null,
  last_notified_price_eur  numeric(10,2),
  created_at               timestamptz not null default now(),
  unique (user_id, laptop_id)
);

create index if not exists price_alerts_user_idx   on public.price_alerts (user_id);
create index if not exists price_alerts_laptop_idx on public.price_alerts (laptop_id);

alter table public.price_alerts enable row level security;

create policy "owner reads own alerts"
  on public.price_alerts for select
  using (auth.uid() = user_id);

create policy "owner writes own alerts"
  on public.price_alerts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
