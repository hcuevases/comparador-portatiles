-- 0037_clean_sentinel_prices.sql
-- Limpia precios placeholder/centinela de PcComponentes colados en prices_history (6.45,
-- 9999, ~10005…) por falta de validación en la ingesta. La ingesta ya valida desde
-- lib/price.ts + scrape-catalog.ts (descarta < 100 o > 9500 €); esto borra lo ya guardado.
-- Solo elimina lo implausible: los workstations reales (~8270-8700 €) quedan. Idempotente.
-- (Confirmado: los portátiles con un 10005.45 tienen precio real 799-3049 € → es placeholder.)

delete from public.prices_history
where price_eur < 100 or price_eur > 9500;
