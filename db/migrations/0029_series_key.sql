-- 0029_series_key.sql
-- Clave de agrupación de variantes: el prefijo del título del producto antes del
-- primer token de specs (pantalla/CPU/RAM). PcComponentes mete toda la config en el
-- título (= laptops.model), así que cada SKU es una fila; esta clave agrupa las
-- configuraciones de un mismo modelo. Se agrupa por (brand, series_key).
--
-- Calculada por trigger desde `model`. `series_locked` protege correcciones manuales
-- (p.ej. gaming SKUs cuyo título lleva el código de unidad y el regexp no agrupa):
--   update laptops set series_key='Katana 15 HX', series_locked=true where ...;

alter table public.laptops add column if not exists series_key text;
alter table public.laptops add column if not exists series_locked boolean not null default false;

-- Corta el título en el primer token de specs y normaliza (trim + colapsar espacios).
-- immutable: depende solo del argumento, apto para índices y backfill.
create or replace function public.compute_series_key(p_model text)
returns text
language sql
immutable
as $$
  select nullif(
    btrim(regexp_replace(
      regexp_replace(
        p_model,
        '\s+(\d{1,2}([.,]\d)?\s?"|\d{1,2}([.,]\d)?\s?pulgadas|Intel|AMD|Ryzen|Snapdragon|Qualcomm|Apple\sM|Core|\d+\s?GB).*$',
        '', 'i'
      ),
      '\s+', ' ', 'g'
    )),
    ''
  );
$$;

-- Recalcula series_key al insertar, o al actualizar si cambió el modelo, salvo que
-- la fila esté bloqueada por una corrección manual.
create or replace function public.set_series_key()
returns trigger
language plpgsql
as $$
begin
  if new.series_locked then
    return new;
  end if;
  if (tg_op = 'INSERT') or (new.model is distinct from old.model) then
    new.series_key := public.compute_series_key(new.model);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_series_key on public.laptops;
create trigger trg_set_series_key
  before insert or update on public.laptops
  for each row execute function public.set_series_key();

-- Backfill de lo existente (respeta filas bloqueadas; al inicio no hay ninguna).
update public.laptops set series_key = public.compute_series_key(model) where not series_locked;

-- Índice para el GROUP BY del catálogo (solo visibles).
create index if not exists laptops_series_idx
  on public.laptops (brand, series_key) where discontinued_at is null;
