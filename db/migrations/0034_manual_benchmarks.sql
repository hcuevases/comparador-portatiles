-- 0034_manual_benchmarks.sql
-- Benchmarks MANUALES para componentes que NO están en nanoreview (Apple M-Pro/Max).
-- status='manual' → el enricher los respeta (no re-scrapea; --retry-notfound los excluye
-- por no ser 'notfound'). La ficha/comparar los leen por el mismo join LEFT que el resto.
--
-- Números: Geekbench 6 (browser.geekbench.com/processors), medias a 2026-06-23.
-- cores/release_year de las specs de Apple. score se deja null (no hay nota 0-100 de
-- nanoreview). Apple M5 Max omitido: demasiado nuevo, sin media fiable todavía.
-- Estos componentes ya estaban en la tabla como status='notfound' (el enricher los
-- intentó y no los halló en nanoreview), así que el upsert los PROMUEVE a manual.
-- Idempotente: on conflict do update fija los valores manuales.

insert into public.cpu_benchmarks
  (component_key, name, status, geekbench_single, geekbench_multi, cores, release_year, scraped_at)
values
  ('apple-m4-pro', 'Apple M4 Pro', 'manual', 3925, 22094, 14, 2024, now()),
  ('apple-m4-max', 'Apple M4 Max', 'manual', 4060, 26675, 16, 2024, now())
on conflict (component_key) do update set
  name             = excluded.name,
  status           = 'manual',
  geekbench_single = excluded.geekbench_single,
  geekbench_multi  = excluded.geekbench_multi,
  cores            = excluded.cores,
  release_year     = excluded.release_year,
  scraped_at       = excluded.scraped_at;
