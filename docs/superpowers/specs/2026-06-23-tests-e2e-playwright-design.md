# Diseño: tests e2e con Playwright

**Fecha:** 2026-06-23
**Estado:** aprobado (pendiente de revisión del spec por el usuario)

## Problema

El repo solo tiene tests unitarios (Vitest, lógica pura). Flujos de usuario clave —la
home carga y muestra portátiles, los filtros, abrir una ficha, el bottom-sheet de filtros
en móvil— se verifican **a mano** en cada cambio. Queremos una red de seguridad
automática que ejecute esos flujos en un navegador real en cada PR.

## Decisiones

- **Runner**: `@playwright/test` (devDep nueva). Alineado con `playwright ^1.60` que ya
  usa el repo para scraping → mismo ecosistema aprobado, no es una pieza ajena.
- **Dónde corre**: en **CI**, job nuevo `e2e` en `ci.yml`, contra un **build local** que
  levanta el propio Playwright (`webServer`). Requiere 2 secrets de Supabase (ya añadidos).
- **Aserciones estructurales**, no datos concretos (≥1 card, presencia de contador, cambio
  de URL) → no se rompen si cambia el catálogo.
- **Sin flujos con login** en la v1 (sync, comparativas guardadas): necesitan usuario de
  prueba. YAGNI.
- **No bloqueante al principio**: branch protection solo exige el check "Lint + Typecheck".
  El job `e2e` se ejecuta y muestra estado pero no bloquea el merge hasta que el usuario lo
  promueva a check requerido (despliegue de bajo riesgo si al principio hay flakiness).

## Arquitectura

### 1. Setup
- **devDep** `@playwright/test` (versión alineada con `playwright`, ^1.60). Script en
  `package.json`: `"e2e": "playwright test"`.
- **`playwright.config.ts`** (raíz):
  - `testDir: 'e2e'`, `baseURL: 'http://localhost:3000'`.
  - `webServer`: `command: 'npm run build && npm run start'`, `url: 'http://localhost:3000'`,
    `timeout: 120_000`, `reuseExistingServer: !process.env.CI`. (En local reusa tu dev/start
    si ya hay uno; lee `.env.local` solo. En CI el env llega del job.)
  - `retries: process.env.CI ? 1 : 0`, `forbidOnly: !!process.env.CI`, `reporter: 'list'`
    (+ `html` con `open: 'never'`).
  - Un solo proyecto base chromium (`devices['Desktop Chrome']`). Los specs de móvil fijan
    su viewport con `test.use(devices['Pixel 5'])` dentro del archivo (no se duplica la
    suite en dos proyectos).
- **Naming**: specs en `e2e/*.spec.ts`. Vitest incluye `**/*.test.ts` (otra extensión), así
  que **no** recoge los e2e; y Playwright (testDir `e2e`) no toca los `*.test.ts` unitarios.
- **`.gitignore`**: añadir `playwright-report/`, `test-results/`, `/playwright/.cache/`.

### 2. Specs (`e2e/`)
- **`home.spec.ts`** — `goto('/')`; espera ≥1 `a[href^="/portatiles/"]`; el texto de
  contador (`/series|resultados|Sin resultados/`) es visible. (Smoke: app + Supabase.)
- **`filters.spec.ts`** — `goto('/')`; click en el botón con label fijo **"16 GB+"**
  (RAM mínima, siempre presente); espera que la URL contenga `ram_min=16` y que siga
  habiendo grid (≥1 card) o el contador haya cambiado. (Label fijo → no depende de marcas.)
- **`detail.spec.ts`** — `goto('/')`; click en el primer `a[href^="/portatiles/"]`; espera
  URL `**/portatiles/**` y un elemento conocido de la ficha (heading de specs o el precio).
- **`mobile-filters.spec.ts`** — `test.use(devices['Pixel 5'])`; `goto('/')`; el botón
  `getByRole('button', { name: /Filtros/ })` es visible; click → `getByRole('dialog')`
  visible; click en "Ver resultados" (o ✕) → el dialog deja de estar visible.

### 3. Selectores y robustez
- Semánticos (`getByRole`, texto, `href^="/portatiles/"`), **sin tocar componentes**.
- Si algún flujo no tuviera selector estable, se añadiría un `data-testid` mínimo (se marca
  en el plan; no a priori). Con los selectores de arriba no debería hacer falta.
- Esperas con auto-waiting de Playwright (`expect(locator).toBeVisible()`), sin sleeps.

### 4. CI (`ci.yml`)
Job nuevo `e2e` (paralelo a `quality`):
- `runs-on: ubuntu-latest`, `timeout-minutes: 15`.
- Checkout → setup-node 22 (cache npm) → `npm ci` → `npx playwright install --with-deps chromium`.
- `npm run e2e` con env:
  - `NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}`
  - El env del step cubre tanto el `npm run build` (inlina las `NEXT_PUBLIC_*`) como el
    `npm run start` (SSR) que lanza el `webServer`.
- Subir el reporte como artifact si falla: `actions/upload-artifact@v4` con
  `playwright-report/`, `if: always()`.

### 5. Manejo de errores / flakiness
- `retries: 1` en CI absorbe fallos transitorios (arranque, red a Supabase).
- Aserciones tolerantes a datos. Si la home no tuviera datos (Supabase caído), `home.spec`
  fallaría legítimamente (señal útil), no por bug del test.

## Tests (de los propios tests)
- No hay "test del test"; la validación es: `npm run e2e` en verde **en local** (contra
  `.env.local`) y el job `e2e` en verde en el PR (contra los secrets). Verificación manual
  documentada en el plan.

## No-objetivos (YAGNI)
- Login / flujos autenticados (sync, /mis-comparativas, alertas).
- Visual regression / screenshots de referencia.
- Cubrir todos los filtros (solo uno representativo) ni todos los navegadores (solo chromium
  + un viewport móvil).
- Hacer el job `e2e` bloqueante de entrada (lo promueve el usuario cuando esté estable).
- Tocar la lógica/UX de la app.

## Prerrequisito (ya hecho)
- Secrets de GitHub `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` añadidos
  al repo (2026-06-23).
