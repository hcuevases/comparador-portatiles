-- 0035_snapdragon_overrides.sql
-- Overrides de matching clave→slug para los Snapdragon X. El normalizador (#79) produce
-- claves por código de modelo, pero nanoreview usa slugs con el tier en el nombre
-- (qualcomm-snapdragon-x-elite-x1e-80-100, etc.). Estos overrides los redirigen al slug
-- real (verificados contra nanoreview.net, 2026-06-23). Tras aplicarlos, re-scrapear con
-- `npm run enrich:benchmarks -- --kind cpu --retry-notfound`.
--
-- Notas:
--  - X1P-64-100 = la página genérica `qualcomm-snapdragon-x-plus` de nanoreview.
--  - "Snapdragon X" a secas (sin Elite/Plus) = tier base = X1-26-100.
--  - El tier genérico `qualcomm-snapdragon-x-elite` (= X1E-84-100) y `…-x-plus` ya casan
--    directos; no necesitan override.

insert into public.benchmark_overrides (kind, source_key, nanoreview_slug) values
  ('cpu', 'qualcomm-snapdragon-x',          'qualcomm-snapdragon-x-x1-26-100'),
  ('cpu', 'qualcomm-snapdragon-x1-26-100',  'qualcomm-snapdragon-x-x1-26-100'),
  ('cpu', 'qualcomm-snapdragon-x1p-42-100', 'qualcomm-snapdragon-x-plus-x1p-42-100'),
  ('cpu', 'qualcomm-snapdragon-x1p-64-100', 'qualcomm-snapdragon-x-plus'),
  ('cpu', 'qualcomm-snapdragon-x1e-78-100', 'qualcomm-snapdragon-x-elite-x1e-78-100'),
  ('cpu', 'qualcomm-snapdragon-x1e-80-100', 'qualcomm-snapdragon-x-elite-x1e-80-100')
on conflict (kind, source_key) do update set nanoreview_slug = excluded.nanoreview_slug;
