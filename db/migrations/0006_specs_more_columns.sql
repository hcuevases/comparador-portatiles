-- 0006_specs_more_columns.sql
-- Añade 5 columnas a `specs` con información que ya viene gratis en Algolia
-- (campo `filtersWithGroup`) y no estábamos guardando:
--
-- - screen_panel_type: tipo de panel (IPS, OLED, Táctil, LED, Retina...).
-- - usage_type:        gama de uso (Gaming, Ultrabook, Para estudiar, Para
--                      Profesionales, Copilot+ PCs, etc.).
-- - keyboard_lang:     idioma del teclado normalizado (ES, FR, DE...).
-- - ai_optimized:      true si Algolia lo marca como "Orientados a IA" o
--                      "IA integrada".
-- - product_line:      línea de producto del fabricante (ThinkPad, EliteBook,
--                      Vivobook, etc.). Útil para refinar la búsqueda por
--                      familia dentro de una marca.
--
-- Todas las columnas son NULL-able porque la cobertura de Algolia no es total
-- (ej. "Tipo Pantalla" cubre ~1.500 de los 3.633 productos). Si Algolia no
-- expone el dato, queda NULL.
--
-- IDEMPOTENTE: usa IF NOT EXISTS — re-correrla no rompe nada.

alter table public.specs
  add column if not exists screen_panel_type text,
  add column if not exists usage_type        text,
  add column if not exists keyboard_lang     text,
  add column if not exists ai_optimized      boolean,
  add column if not exists product_line      text;
