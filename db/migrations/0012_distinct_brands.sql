-- 0012_distinct_brands.sql
-- RPC `distinct_brands`: devuelve las marcas distintas del catálogo (~34), ya
-- ordenadas.
--
-- PROBLEMA QUE RESUELVE: la home obtenía las marcas para los pills del filtro con
-- `from('laptops').select('brand')` y deduplicaba en JS. Con el catálogo ampliado
-- a ~3800 (#25), PostgREST corta esa query al límite por defecto de 1000 filas, así
-- que solo llegaban las marcas presentes en las primeras 1000 filas (Acer…Asus) y el
-- resto desaparecía del filtro. Pasar el `distinct` al servidor devuelve ~34 filas,
-- sin tope.
--
-- security invoker → respeta la RLS de lectura pública de `laptops`.

create or replace function public.distinct_brands()
returns table (brand text)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct l.brand from public.laptops l order by l.brand;
$$;

grant execute on function public.distinct_brands() to anon, authenticated;
