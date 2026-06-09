-- 0019_specs_enriched_at.sql
-- Marca de "ficha ya intentada" para el enricher (scripts/enrich-specs.ts, ADR-003).
--
-- PROBLEMA: el enricher elegía objetivos por `cpu_cores is null`. Pero hay fichas que
-- siempre fallan (404 de slug obsoleto, o tabla atípica que el parser no pilla) y que
-- por tanto se quedan en null y se RE-PROCESABAN en cada tanda. Peor aún: una ficha sin
-- las etiquetas que dispara el waitForFunction agota su timeout (segundos perdidos) y
-- vuelve a hacerlo a la siguiente. El backfill se arrastraba.
--
-- SOLUCIÓN: `enriched_at` marca cada ficha intentada (con éxito, 404 o sin-parsear),
-- y el enricher pasa a coger `enriched_at is null` → cada ficha se visita UNA vez.
-- Para re-enriquecer en el futuro (por si una ficha gana specs), bastaría con poner
-- `enriched_at = null` en las filas a refrescar.
--
-- Backfill: las que ya tienen specs de la ficha (cpu_cores no null, de las tandas
-- previas) se marcan como hechas para no repetirlas. Las que quedaron en null
-- (404/sin-parsear de antes) se reintentarán una vez más con la lógica nueva y ahí
-- quedarán marcadas.

alter table public.specs
  add column if not exists enriched_at timestamptz;

update public.specs
  set enriched_at = now()
  where cpu_cores is not null and enriched_at is null;
