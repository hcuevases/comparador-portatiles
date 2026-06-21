-- 0032_merge_slug_dups_generalized.sql
-- Segunda pasada del sub-proyecto A: los duplicados por cambio de slug que 0031 dejó fuera
-- por ser conservadora (exigía vieja=descatalogada+sin-EAN y canónica=activa+con-EAN).
-- Casos que se escaparon: la vieja seguía activa (sin descatalogar), o NINGUNA de las dos
-- tenía EAN, o solo difieren por el slug pero ambas activas.
--
-- Criterio generalizado y SEGURO: grupos (brand, model) idéntico, no reacondicionado, con
-- count(*) > 1 y **count(distinct ean) <= 1**. La condición de EAN excluye automáticamente
-- las variantes legítimas (p.ej. HP EliteBook 6 G1i con 2 EAN/MPN reales = 2 SKUs distintos).
--
-- Canónica del grupo = la fila con EAN; si ninguna, la activa; si empata, la más reciente.
-- Las demás se fusionan en ella: se reasigna su prices_history (preservar) y se borran (el
-- cascade retira sus specs/affiliate_links). En el momento de escribir: 7 filas a fusionar,
-- 52 de prices_history, 0 price_alerts y 0 comparisons. Idempotente.

-- 1) Reasignar el histórico de precios de las no-canónicas a la canónica de su grupo.
with d as (
  select brand, model
  from public.laptops
  where refurbished = false
  group by brand, model
  having count(*) > 1 and count(distinct ean) <= 1
),
ranked as (
  select
    l.id,
    first_value(l.id) over (
      partition by l.brand, l.model
      order by (l.ean is not null) desc, (l.discontinued_at is null) desc, l.created_at desc
    ) as canon_id,
    row_number() over (
      partition by l.brand, l.model
      order by (l.ean is not null) desc, (l.discontinued_at is null) desc, l.created_at desc
    ) as rn
  from public.laptops l
  join d on d.brand = l.brand and d.model = l.model
  where l.refurbished = false
),
mapping as (select id as old_id, canon_id as new_id from ranked where rn > 1)
update public.prices_history ph
set laptop_id = m.new_id
from mapping m
where ph.laptop_id = m.old_id;

-- 2) Borrar las filas no-canónicas (cascade retira specs + affiliate_links; histórico ya movido).
with d as (
  select brand, model
  from public.laptops
  where refurbished = false
  group by brand, model
  having count(*) > 1 and count(distinct ean) <= 1
),
ranked as (
  select
    l.id,
    row_number() over (
      partition by l.brand, l.model
      order by (l.ean is not null) desc, (l.discontinued_at is null) desc, l.created_at desc
    ) as rn
  from public.laptops l
  join d on d.brand = l.brand and d.model = l.model
  where l.refurbished = false
)
delete from public.laptops l
using ranked r
where l.id = r.id and r.rn > 1;
