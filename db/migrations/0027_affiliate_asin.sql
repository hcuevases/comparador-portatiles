-- 0027_affiliate_asin.sql
-- Cache del ASIN de Amazon por enlace de afiliado, para el conector PA-API.
--
-- El conector casa productos por EAN (laptops.ean ↔ PA-API). La PRIMERA vez resuelve
-- EAN→ASIN con SearchItems; cachear el ASIN aquí permite usar GetItems directo (por
-- ASIN) en las corridas siguientes — una llamada menos, importante con el rate limit
-- estricto de PA-API (~1 req/s + cuota diaria).
--
-- Nullable y específico de Amazon: las filas de afiliados de otros retailers lo dejan
-- en null. No hace falta índice: siempre se accede por (laptop_id, retailer_id), que ya
-- es único (ver 0001_init.sql).

alter table public.affiliate_links add column if not exists asin text;
