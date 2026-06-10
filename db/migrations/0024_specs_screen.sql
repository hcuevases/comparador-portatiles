-- 0024_specs_screen.sql
-- Specs de pantalla ricas, a rellenar desde la ficha de PcComponentes (enrich-specs).
-- Algolia no las expone; la ficha sí, pero está tras Cloudflare (intermitente) → estas
-- columnas se pueblan cuando el muro ceda. Ver lib/specs/parse-screen.ts.
--
-- Nullable (cobertura parcial). screen_touch es true|null (no guardamos false: "no
-- mencionado" no implica "no táctil"), igual criterio que ai_optimized.

alter table public.specs add column if not exists screen_brightness_nits integer;
alter table public.specs add column if not exists screen_touch          boolean;
alter table public.specs add column if not exists screen_color_gamut    text;
alter table public.specs add column if not exists screen_hdr            text;
alter table public.specs add column if not exists screen_response_ms    integer;
