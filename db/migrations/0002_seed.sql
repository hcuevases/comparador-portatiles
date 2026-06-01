-- 0002_seed.sql
--
-- ⚠️  DEPRECADA — no volver a aplicar.
--
-- Datos de prueba que metimos al arrancar (6 portátiles a mano + 4 retailers)
-- para validar la integración end-to-end ANTES de tener el scraper.
-- A día de hoy el catálogo se llena con `scripts/scrape-catalog.ts` desde
-- PcComponentes (cientos de portátiles reales). Los 6 portátiles seed se
-- borran en `0005_cleanup_initial_seed.sql`.
--
-- Se conserva esta migración como registro histórico, no se vuelve a aplicar.
-- Si por error la corres, no rompe nada — solo reinsertaría los 6 portátiles
-- huérfanos que después tendrías que volver a limpiar.
--
-- Datos de prueba para validar la integración end-to-end.
-- Idempotente para las tablas con unique constraint: si rerruns, no duplica.
-- prices_history sí duplica si rerruns (no tiene unique).

-- Retailers
insert into public.retailers (slug, name, base_url, affiliate_id)
values
  ('amazon-es',         'Amazon España',        'https://www.amazon.es',         'comparador-21'),
  ('mediamarkt',        'MediaMarkt',           'https://www.mediamarkt.es',     null),
  ('pccomponentes',     'PcComponentes',        'https://www.pccomponentes.com', null),
  ('elcorteingles',     'El Corte Inglés',      'https://www.elcorteingles.es',  null)
on conflict (slug) do nothing;

-- Laptops
insert into public.laptops (slug, brand, model, year, image_url, description)
values
  ('lenovo-thinkpad-x1-carbon-gen-12',  'Lenovo', 'ThinkPad X1 Carbon Gen 12', 2024, null,
   'Ultraligero profesional con Intel Core Ultra y pantalla OLED opcional.'),

  ('apple-macbook-air-m3-13',           'Apple',  'MacBook Air M3 13"',         2024, null,
   'Chip Apple M3, sin ventiladores, autonomía excepcional.'),

  ('dell-xps-13-9340',                  'Dell',   'XPS 13 (9340)',              2024, null,
   'Compacto premium con Intel Core Ultra y diseño minimalista.'),

  ('asus-rog-zephyrus-g14-2024',        'ASUS',   'ROG Zephyrus G14',           2024, null,
   'Portátil gaming compacto con AMD Ryzen 9 y RTX 4070.'),

  ('framework-laptop-13-intel-ultra',   'Framework', 'Laptop 13 Intel Core Ultra', 2024, null,
   'Modular y reparable. Cambio de puertos y mainboard sin herramientas.'),

  ('hp-spectre-x360-14',                'HP',     'Spectre x360 14',            2024, null,
   'Convertible 2-en-1 con pantalla OLED táctil y stylus incluido.')
on conflict (slug) do nothing;

-- Specs (PK = laptop_id, así que conflict por laptop_id)
insert into public.specs (laptop_id, cpu, cpu_cores, ram_gb, storage_gb, storage_type, gpu, gpu_vram_gb,
                          screen_inches, screen_resolution, screen_refresh_hz, weight_kg, battery_wh, ports, os)
select id, 'Intel Core Ultra 7 155H', 16, 32, 1024, 'NVMe', 'Intel Arc (iGPU)', null,
       14.0, '2880x1800', 60, 1.09, 57.0,
       ARRAY['USB-C/TB4 x2','USB-A x2','HDMI 2.1','jack 3.5'], 'Windows 11 Pro'
from public.laptops where slug = 'lenovo-thinkpad-x1-carbon-gen-12'
on conflict (laptop_id) do nothing;

insert into public.specs (laptop_id, cpu, cpu_cores, ram_gb, storage_gb, storage_type, gpu, gpu_vram_gb,
                          screen_inches, screen_resolution, screen_refresh_hz, weight_kg, battery_wh, ports, os)
select id, 'Apple M3', 8, 16, 512, 'NVMe', 'Apple M3 GPU (10-core)', null,
       13.6, '2560x1664', 60, 1.24, 52.6,
       ARRAY['USB-C/TB4 x2','MagSafe 3','jack 3.5'], 'macOS Sonoma'
from public.laptops where slug = 'apple-macbook-air-m3-13'
on conflict (laptop_id) do nothing;

insert into public.specs (laptop_id, cpu, cpu_cores, ram_gb, storage_gb, storage_type, gpu, gpu_vram_gb,
                          screen_inches, screen_resolution, screen_refresh_hz, weight_kg, battery_wh, ports, os)
select id, 'Intel Core Ultra 7 155H', 16, 16, 512, 'NVMe', 'Intel Arc (iGPU)', null,
       13.4, '1920x1200', 60, 1.17, 55.0,
       ARRAY['USB-C/TB4 x2'], 'Windows 11 Home'
from public.laptops where slug = 'dell-xps-13-9340'
on conflict (laptop_id) do nothing;

insert into public.specs (laptop_id, cpu, cpu_cores, ram_gb, storage_gb, storage_type, gpu, gpu_vram_gb,
                          screen_inches, screen_resolution, screen_refresh_hz, weight_kg, battery_wh, ports, os)
select id, 'AMD Ryzen 9 8945HS', 8, 32, 1024, 'NVMe', 'NVIDIA RTX 4070 Laptop', 8,
       14.0, '2880x1800', 120, 1.50, 73.0,
       ARRAY['USB-C/USB4 x1','USB-C x1','USB-A x2','HDMI 2.1','MicroSD','jack 3.5'], 'Windows 11 Home'
from public.laptops where slug = 'asus-rog-zephyrus-g14-2024'
on conflict (laptop_id) do nothing;

insert into public.specs (laptop_id, cpu, cpu_cores, ram_gb, storage_gb, storage_type, gpu, gpu_vram_gb,
                          screen_inches, screen_resolution, screen_refresh_hz, weight_kg, battery_wh, ports, os)
select id, 'Intel Core Ultra 7 155H', 16, 32, 1024, 'NVMe', 'Intel Arc (iGPU)', null,
       13.5, '2880x1920', 120, 1.30, 61.0,
       ARRAY['Modular (4 puertos configurables)'], 'Windows 11 Pro'
from public.laptops where slug = 'framework-laptop-13-intel-ultra'
on conflict (laptop_id) do nothing;

insert into public.specs (laptop_id, cpu, cpu_cores, ram_gb, storage_gb, storage_type, gpu, gpu_vram_gb,
                          screen_inches, screen_resolution, screen_refresh_hz, weight_kg, battery_wh, ports, os)
select id, 'Intel Core Ultra 7 155H', 16, 16, 1024, 'NVMe', 'Intel Arc (iGPU)', null,
       14.0, '2880x1800', 120, 1.39, 68.0,
       ARRAY['USB-C/TB4 x2','USB-A x1','jack 3.5'], 'Windows 11 Home'
from public.laptops where slug = 'hp-spectre-x360-14'
on conflict (laptop_id) do nothing;

-- Affiliate links: un par por laptop
insert into public.affiliate_links (laptop_id, retailer_id, url)
select l.id, r.id, 'https://www.amazon.es/dp/EXAMPLE-' || l.slug
from public.laptops l, public.retailers r
where r.slug = 'amazon-es'
on conflict (laptop_id, retailer_id) do nothing;

insert into public.affiliate_links (laptop_id, retailer_id, url)
select l.id, r.id, 'https://www.pccomponentes.com/' || l.slug
from public.laptops l, public.retailers r
where r.slug = 'pccomponentes' and l.slug in (
  'lenovo-thinkpad-x1-carbon-gen-12',
  'dell-xps-13-9340',
  'asus-rog-zephyrus-g14-2024'
)
on conflict (laptop_id, retailer_id) do nothing;

-- Precios actuales (1 por (laptop, retailer))
insert into public.prices_history (laptop_id, retailer_id, price_eur, in_stock)
select l.id, r.id,
       case l.slug
         when 'lenovo-thinkpad-x1-carbon-gen-12' then 2199.00
         when 'apple-macbook-air-m3-13'           then 1299.00
         when 'dell-xps-13-9340'                  then 1499.00
         when 'asus-rog-zephyrus-g14-2024'        then 2299.00
         when 'framework-laptop-13-intel-ultra'   then 1799.00
         when 'hp-spectre-x360-14'                then 1599.00
       end,
       true
from public.laptops l, public.retailers r
where r.slug = 'amazon-es';

insert into public.prices_history (laptop_id, retailer_id, price_eur, in_stock)
select l.id, r.id,
       case l.slug
         when 'lenovo-thinkpad-x1-carbon-gen-12' then 2249.00
         when 'dell-xps-13-9340'                  then 1469.00
         when 'asus-rog-zephyrus-g14-2024'        then 2349.00
         else null
       end,
       true
from public.laptops l, public.retailers r
where r.slug = 'pccomponentes' and l.slug in (
  'lenovo-thinkpad-x1-carbon-gen-12',
  'dell-xps-13-9340',
  'asus-rog-zephyrus-g14-2024'
);
