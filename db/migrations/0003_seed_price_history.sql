-- 0003_seed_price_history.sql
-- Genera 90 días de histórico sintético por cada (laptop, retailer) que
-- tenga un precio "actual" registrado. La serie es un random walk con drift
-- suave hacia el precio actual, acotado a [70%, 130%] del actual para evitar
-- valores irreales.
--
-- IDEMPOTENTE: borra todo prices_history y regenera precio actual
-- (observed_at = now()) + 90 días hacia atrás. Re-correrla deja el estado
-- consistente.
--
-- REQUIERE que 0002_seed.sql ya esté aplicado (necesita al menos una fila
-- por (laptop, retailer) en prices_history como ancla). Si no hay precios
-- ancla, esta migración no inserta nada (resultado: 0 filas).
--
-- NOTA: todo va en un único statement `WITH RECURSIVE ... INSERT` porque
-- el SQL Editor de Supabase ejecuta cada sentencia como transacción
-- independiente. Eso descarta tablas temporales con ON COMMIT DROP y bloques
-- DO $$...$$ que dependan de pasos previos. Postgres garantiza que todas
-- las CTEs (incluida la modificante `deleted`) comparten el mismo snapshot,
-- así que `current_prices` ve los datos ANTES del DELETE aunque convivan en
-- el mismo bloque.
--
-- AVISO: cuando arranque el cron real de ingesta, NO vuelvas a aplicar
-- esta migración — eliminaría histórico real. Manténla como registro
-- del seed inicial.

with recursive
  -- 1. Captura del precio actual por (laptop, retailer). Es el ancla.
  current_prices as (
    select distinct on (laptop_id, retailer_id)
      laptop_id, retailer_id, price_eur as base
    from public.prices_history
    order by laptop_id, retailer_id, observed_at desc
  ),

  -- 2. Borrado total del histórico. Postgres ejecuta esta CTE modificante
  --    siempre, aunque no se referencie. El snapshot de current_prices es
  --    anterior y no se ve afectado.
  deleted as (
    delete from public.prices_history
    returning 1
  ),

  -- 3. Random walk: 90 días hacia atrás desde el precio actual.
  walk(laptop_id, retailer_id, base, days_back, price) as (
    -- Punto inicial: hace 90 días, precio en [90%, 110%] del actual.
    select
      cp.laptop_id,
      cp.retailer_id,
      cp.base,
      90,
      round((cp.base * (0.90 + random() * 0.20))::numeric, 2)
    from current_prices cp

    union all

    -- Drift de ±2% diario + regresión a la media hacia el precio actual.
    -- Acotado a [70%, 130%] del actual para evitar runaway.
    select
      w.laptop_id,
      w.retailer_id,
      w.base,
      w.days_back - 1,
      round(
        least(
          greatest(
            w.price * (1 + (random() - 0.5) * 0.04) + (w.base - w.price) * 0.02,
            w.base * 0.70
          ),
          w.base * 1.30
        )::numeric,
        2
      )
    from walk w
    where w.days_back > 0
  ),

  -- 4. Forzar que `deleted` se materialice antes del INSERT final.
  --    (Postgres lo haría igualmente, pero referenciar lo deja explícito.)
  delete_ack as (
    select count(*) as removed from deleted
  )

-- 5. INSERT final: precio actual (días 0) + 90 días de histórico.
insert into public.prices_history (laptop_id, retailer_id, price_eur, in_stock, observed_at)
select
  laptop_id,
  retailer_id,
  price_eur,
  in_stock,
  observed_at
from (
  -- Precio actual: observed_at = now()
  select
    cp.laptop_id,
    cp.retailer_id,
    cp.base as price_eur,
    true as in_stock,
    now() as observed_at
  from current_prices cp
  cross join delete_ack

  union all

  -- Histórico: 90 días hacia atrás
  select
    w.laptop_id,
    w.retailer_id,
    w.price as price_eur,
    true as in_stock,
    (now() - (w.days_back || ' days')::interval) as observed_at
  from walk w
  cross join delete_ack
  where w.days_back > 0
) combined;
