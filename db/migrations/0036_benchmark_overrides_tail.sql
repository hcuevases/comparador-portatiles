-- 0036_benchmark_overrides_tail.sql
-- Overrides de la cola larga de CPUs notfound: casos de "sufijo perdido" donde el
-- nombre del portátil omitía la letra final y el normalizador generó una clave sin ella,
-- pero el chip SÍ está en nanoreview con el sufijo (verificado contra nanoreview.net,
-- 2026-06-23). Tras aplicar: `npm run enrich:benchmarks -- --kind cpu --retry-notfound`.
--
-- El resto de la cola larga NO es recuperable por override: nanoreview no lista las U de
-- bajo binning (Core Ultra 5 115U/120U, Core 5 115U…), ni los chips muy viejos (Intel 6ª/7ª
-- gen, 2015-2017), ni los muy nuevos (Ryzen AI 5 330, Ryzen 5 130/7 160, Apple M5 Max).
-- Para esos haría falta valor manual; de momento se dejan sin benchmark (baja cobertura).

insert into public.benchmark_overrides (kind, source_key, nanoreview_slug) values
  ('cpu', 'amd-ryzen-5-7430',    'amd-ryzen-5-7430u'),
  ('cpu', 'intel-core-i5-10310', 'intel-core-i5-10310u')
on conflict (kind, source_key) do update set nanoreview_slug = excluded.nanoreview_slug;
