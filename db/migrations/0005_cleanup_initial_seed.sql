-- 0005_cleanup_initial_seed.sql
-- Borra los 6 portátiles que metimos a mano en 0002_seed.sql al arrancar el
-- proyecto. Aquellos eran datos de prueba ANTES de tener el scraper de
-- PcComponentes; ahora el catálogo está poblado con productos reales y los
-- 6 originales sin imagen ni precios reales sobran.
--
-- El cascade ON DELETE de las FK borra automáticamente sus specs,
-- affiliate_links y prices_history asociadas — no hace falta DELETE explícito
-- en esas tablas.
--
-- ATENCIÓN: las comparativas guardadas que incluyeran alguno de estos UUIDs
-- en su `laptop_ids` quedan con ids huérfanos en el array. /mis-comparativas
-- ya los filtra (solo muestra labels de los que existen en `laptops`), así
-- que no rompe la UI; simplemente la comparativa aparece con menos productos.
--
-- IDEMPOTENTE: si los slugs no existen (porque ya se borraron antes), el
-- DELETE no afecta a ninguna fila y no falla.

delete from public.laptops
where slug in (
  'lenovo-thinkpad-x1-carbon-gen-12',
  'apple-macbook-air-m3-13',
  'dell-xps-13-9340',
  'asus-rog-zephyrus-g14-2024',
  'framework-laptop-13-intel-ultra',
  'hp-spectre-x360-14'
);
