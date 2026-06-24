# CLAUDE.md — Comparador de portátiles

@AGENTS.md

Contexto específico de este proyecto. El contexto general del usuario está en el vault: `C:\Users\Hector\OneDrive\Aplicaciones\remotely-save\Hc\CLAUDE.md`.

## Qué es

Web para comparar especificaciones, precios y reseñas de portátiles con enlaces afiliados a retailers (Amazon, MediaMarkt, etc.). Sin pasarela de pago propia — la conversión ocurre en el retailer destino.

## Restricciones que mandan el diseño

- **Alta escalabilidad** — picos esperados (lanzamientos, Black Friday).
- **Equipo con poca experiencia** — preferir servicios gestionados; minimizar superficie operativa.
- **GDPR** — usuarios en la UE, banner de cookies obligatorio, derecho al olvido, regiones EU para todos los proveedores.
- **No aplica PCI DSS** — no se procesan tarjetas, solo afiliación.

## Stack aprobado

Decidido en `ADR-001-comparador-portatiles` (en el vault).

- **Frontend / SSR / Edge:** Next.js 16 (App Router) + React 19 + Tailwind v4, desplegado en **Vercel** (región EU). **OJO:** Next 16 introduce cambios respecto a versiones previas — leer `node_modules/next/dist/docs/` o la documentación oficial antes de asumir APIs.
- **Backend / DB / Auth:** **Supabase** (Postgres, RLS, Auth, Storage) — región EU.
- **Cache:** Upstash Redis o equivalente serverless.
- **Object storage:** Supabase Storage para imágenes de portátiles.
- **Ingesta de precios y specs:** GitHub Actions con cron (no edge functions — los jobs son demasiado largos).
- **CI/CD:** GitHub → Vercel preview deploys → producción al merge a `main`.

## Modelo de datos inicial

A confirmar al definir el esquema, pero se espera tener al menos:

- `laptops` — modelos (marca, modelo, año, slug)
- `specs` — atributos clave (cpu, ram, almacenamiento, pantalla, peso, batería, gpu, puertos)
- `retailers` — fuentes de precios
- `prices_history` — precios por (laptop, retailer, timestamp)
- `users` — cuentas (Supabase Auth)
- `comparisons` — comparativas guardadas por usuario
- `affiliate_links` — link y código por (laptop, retailer)

## Convenciones del repo (a establecer en la primera iteración)

- TypeScript en todo. Strict mode.
- ESLint + Prettier. Conventional Commits.
- Carpetas: `app/` (rutas), `components/`, `lib/` (clientes Supabase, utils), `db/` (migraciones SQL), `scripts/` (jobs de ingesta), `tests/`.
- Migraciones de Supabase versionadas en `db/migrations/`. Nunca cambios directos por el panel sin reflejarlos aquí.

## Comandos (rellenar al hacer `npm init`)

```bash
# instalar
npm install

# desarrollo local
npm run dev

# build de producción
npm run build

# tests (unitarios, Vitest)
npm test

# tests e2e (Playwright, contra build local; necesita Chromium: npx playwright install chromium)
npm run e2e

# lint
npm run lint

# typecheck
npm run typecheck
```

## Reglas para Claude en este repo

1. **Cualquier decisión técnica relevante se documenta como ADR** en el vault (`ADR-NNN-<tema>.md`), no aquí. Este CLAUDE.md solo resume.
2. **No commits a `main` directamente.** Branch + PR + revisión, aunque sea solo.
3. **Secretos jamás en el repo.** Variables sensibles en `.env.local` (gitignored) y en Vercel.
4. **GDPR primero.** Antes de añadir cualquier campo que recoja datos personales, justifica por qué y cómo se borra.
5. **Antes de instalar una dependencia nueva**, comprueba si Next.js o Supabase ya resuelven el problema. Menos piezas, mejor.

## Estado actual

- Scaffold de Next.js 16 (App Router, TS, Tailwind v4, ESLint) generado.
- **Pendiente en Windows:** ejecutar `npm install` desde PowerShell/CMD (los `node_modules` no se pueden generar desde el sandbox Linux porque incluyen binarios nativos específicos del SO).
- Siguiente paso después del `npm install`: `npm run dev` para verificar, luego añadir cliente de Supabase (`@supabase/supabase-js`) y definir el primer esquema.
