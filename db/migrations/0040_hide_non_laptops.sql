-- 0040_hide_non_laptops.sql
-- Soft-hide de entradas cuyo `model` quedó corrompido al texto "Servicio de almacenamiento
-- en la nube PcCloud" (en realidad es el PcCom Revolt 4060 + su variante reacondicionada; el
-- scraper pisó el nombre con datos erróneos). discontinued_at las saca del catálogo, búsqueda,
-- feeds y secciones de la home, sin borrar histórico (reversible: poner discontinued_at = null).
update public.laptops
set discontinued_at = now()
where discontinued_at is null
  and model ilike '%servicio de almacenamiento%';
