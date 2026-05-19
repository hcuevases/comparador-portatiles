# Comparador de portátiles

Web para comparar especificaciones, precios y reseñas de portátiles con enlaces afiliados a retailers (Amazon, MediaMarkt, etc.).

Stack: **Next.js 16 (App Router) + React 19 + Tailwind v4 + Supabase (Postgres, Auth, Storage)** en región EU. Decisiones de arquitectura: ver `ADR-001-comparador-portatiles` en el vault.

## Primer arranque

El scaffold se generó sin `node_modules` (el sandbox que lo creó es Linux y los binarios nativos no se mezclan con Windows). Para tener el repo operativo, desde PowerShell o CMD en la carpeta del proyecto:

```powershell
# 1. Inicializar git
git init -b main

# 2. Instalar dependencias
npm install

# 3. Variables de entorno
copy .env.local.example .env.local
# y rellena los valores reales del proyecto de Supabase

# 4. Arrancar el server de desarrollo
npm run dev

# 5. Primer commit
git add .
git commit -m "chore: initial scaffold (Next.js 16 + Supabase + Prettier)"
```

## Scripts

| Comando              | Para qué                                      |
|----------------------|-----------------------------------------------|
| `npm run dev`        | Server de desarrollo (http://localhost:3000)  |
| `npm run build`      | Build de producción                           |
| `npm run start`      | Server de producción (tras `build`)           |
| `npm run lint`       | ESLint                                        |
| `npm run typecheck`  | `tsc --noEmit`                                |
| `npm run format`     | Prettier en modo escritura                    |

## Estructura

```
app/                  # Rutas (App Router) y layouts
components/           # Componentes React reutilizables
lib/
  supabase/
    client.ts         # Cliente browser (Client Components)
    server.ts         # Cliente RSC / Route Handler / Server Action
    admin.ts          # Cliente service role (scripts/jobs, ignora RLS)
db/
  migrations/
    0001_init.sql     # Esquema inicial (laptops, specs, retailers, etc.)
scripts/              # Jobs de ingesta (precios, specs)
tests/                # Tests (a definir framework — Vitest o Playwright)
```

## Migraciones de Supabase

Las migraciones viven en `db/migrations/` y son la fuente de verdad. **No** edites el esquema desde el panel sin escribir la migración correspondiente.

Para aplicar la primera migración:

1. Crea el proyecto en Supabase (región **EU**, plan Free para empezar).
2. Copia `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` a `.env.local`.
3. En el SQL Editor del dashboard, pega el contenido de `db/migrations/0001_init.sql` y ejecuta. (Más adelante automatizamos con `supabase` CLI.)

## Despliegue

GitHub → Vercel (región EU). Preview deploys por PR; producción al merge a `main`.

Variables de entorno a configurar en Vercel:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (solo en Server Functions / scripts)

## GDPR

Usuarios en la UE; aplican obligaciones de transparencia y borrado.

- Banner de cookies obligatorio antes de cargar trackers de terceros.
- Política de privacidad documentando qué se recoge y por qué.
- Endpoint o flujo claro para que el usuario solicite el borrado de sus comparativas y cuenta.
- No se procesan tarjetas — solo enlaces de afiliación. Fuera del alcance PCI DSS.

## Documentación viva

- Decisiones de arquitectura → vault (`ADR-NNN-<tema>.md`)
- Reglas para Claude en este repo → `CLAUDE.md`
- Contexto general del usuario → `CLAUDE.md` del vault
