-- 0011_prices_retention.sql
-- Retención de `prices_history`: borra a diario los precios de más de 3 meses.
--
-- Por qué: con el catálogo completo (~3800 portátiles, #25) el cron diario añade
-- ~3800 filas/día a `prices_history`. Sin límite, la tabla crece sin fin y el
-- agregado de la RPC `search_laptops` se degrada. Un tope temporal la mantiene
-- acotada (~3800 × 90 ≈ 340k filas en régimen estable).
--
-- Por qué 3 meses: el chart de la ficha solo muestra los últimos 90 días
-- (`HISTORY_DAYS = 90`), así que borrar lo más viejo de 3 meses no quita nada
-- visible. El "precio actual" (último por retailer) tampoco se ve afectado porque
-- el cron diario mantiene precios recientes para todo lo activo.
--
-- Lo hacemos con pg_cron (tarea dentro de la propia BD, gestionada, independiente
-- de los crons de GitHub Actions). Idempotente: `cron.schedule` con el mismo
-- nombre de job actualiza en vez de duplicar.

create extension if not exists pg_cron;

-- Borrado diario a las 05:00 UTC (antes del refresco de precios de las 06:00).
select cron.schedule(
  'prune-prices-history',
  '0 5 * * *',
  $$delete from public.prices_history where observed_at < now() - interval '3 months'$$
);
