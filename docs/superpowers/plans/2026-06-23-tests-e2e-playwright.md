# Tests e2e con Playwright — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una suite e2e con `@playwright/test` (4 flujos smoke) que corre contra un build local, ejecutada en un job nuevo de CI no bloqueante.

**Architecture:** `@playwright/test` con `playwright.config.ts` (webServer = build+start, baseURL localhost:3000), specs en `e2e/*.spec.ts` con aserciones estructurales, y un job `e2e` en `ci.yml` con los secrets de Supabase. Vitest (`**/*.test.ts`) y Playwright (`e2e/`) no se solapan.

**Tech Stack:** @playwright/test ^1.60 (alineado con `playwright` ya instalado), Next.js 16, GitHub Actions. Repo CRLF (no `prettier --write`).

**Spec:** `docs/superpowers/specs/2026-06-23-tests-e2e-playwright-design.md`

---

### Task 1: Setup de Playwright (dep, config, script, gitignore)

**Files:**
- Modify: `package.json` (devDep + script)
- Create: `playwright.config.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Instalar `@playwright/test`** (alineado con `playwright ^1.60`)

Run: `npm install -D @playwright/test@^1.60.0`
Expected: se añade a `devDependencies` y actualiza `package-lock.json`. (El navegador chromium ya suele estar de los scrapers; si no, se instala en Task 2.)

- [ ] **Step 2: Añadir el script `e2e`**

En `package.json`, en `"scripts"`, añadir (junto a `"test"`):
```json
    "e2e": "playwright test",
```

- [ ] **Step 3: Crear `playwright.config.ts`** (en la raíz)

```ts
import { defineConfig, devices } from '@playwright/test';

const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

// e2e contra un build de producción local. En CI el env (NEXT_PUBLIC_SUPABASE_*) llega del
// job; en local, `npm run build`/`start` leen `.env.local`. Vitest usa `**/*.test.ts`;
// estos specs son `e2e/*.spec.ts`, así que no se solapan.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run start',
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
```

- [ ] **Step 4: Ignorar artefactos** — añadir al final de `.gitignore`:

```
# Playwright
/playwright-report/
/test-results/
/playwright/.cache/
```

- [ ] **Step 5: Verificar typecheck** (la config compila y la dep resuelve)

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json playwright.config.ts .gitignore
git commit -m "test(e2e): setup de @playwright/test (config, script, gitignore)"
```

---

### Task 2: Specs de escritorio (home, filtro, ficha)

**Files:**
- Create: `e2e/home.spec.ts`, `e2e/filters.spec.ts`, `e2e/detail.spec.ts`

- [ ] **Step 1: Asegurar el navegador chromium** (una vez, en local)

Run: `npx playwright install chromium`
Expected: chromium instalado (o "is already installed").

- [ ] **Step 2: Crear `e2e/home.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

test('la home carga y muestra portátiles', async ({ page }) => {
  await page.goto('/');
  // Al menos una card enlaza a una ficha de portátil.
  await expect(page.locator('a[href^="/portatiles/"]').first()).toBeVisible();
  // El texto de contador de resultados aparece (o el de "sin resultados").
  await expect(page.getByText(/serie|resultado/i).first()).toBeVisible();
});
```

- [ ] **Step 3: Crear `e2e/filters.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

test('el filtro de RAM mínima acota y se refleja en la URL', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('a[href^="/portatiles/"]').first()).toBeVisible();
  // "16 GB+" es un label fijo del filtro de RAM (no depende de los datos del catálogo).
  await page.getByRole('button', { name: '16 GB+' }).first().click();
  await expect(page).toHaveURL(/ram_min=16/);
  // La página respondió al filtro (sigue mostrando contador / resultados).
  await expect(page.getByText(/serie|resultado/i).first()).toBeVisible();
});
```

- [ ] **Step 4: Crear `e2e/detail.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

test('abrir la ficha de un portátil desde la home', async ({ page }) => {
  await page.goto('/');
  const firstCard = page.locator('a[href^="/portatiles/"]').first();
  await expect(firstCard).toBeVisible();
  await firstCard.click();
  await expect(page).toHaveURL(/\/portatiles\//);
  // Toda ficha tiene un encabezado principal (h1) con el modelo.
  await expect(page.locator('h1').first()).toBeVisible();
});
```

- [ ] **Step 5: Ejecutar los 3 specs** (Playwright hace build+start de la app)

Run: `npm run e2e -- e2e/home.spec.ts e2e/filters.spec.ts e2e/detail.spec.ts`
Expected: 3 passed. (La primera vez tarda: compila la app. Usa `.env.local` para los datos.)
Si la home no trae datos (Supabase), los specs fallarían legítimamente — confirmar que `.env.local` tiene las claves.

- [ ] **Step 6: Commit**

```bash
git add e2e/home.spec.ts e2e/filters.spec.ts e2e/detail.spec.ts
git commit -m "test(e2e): home carga, filtro de RAM y abrir ficha"
```

---

### Task 3: Spec de móvil (bottom-sheet de filtros)

**Files:**
- Create: `e2e/mobile-filters.spec.ts`

- [ ] **Step 1: Crear `e2e/mobile-filters.spec.ts`**

```ts
import { test, expect, devices } from '@playwright/test';

// Viewport móvil para que aparezca el botón/bottom-sheet (oculto en ≥md).
test.use({ ...devices['Pixel 5'] });

test('el bottom-sheet de filtros abre y cierra en móvil', async ({ page }) => {
  await page.goto('/');
  const trigger = page.getByRole('button', { name: /Filtros/ });
  await expect(trigger).toBeVisible();
  await trigger.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Cerrar con "Ver resultados" → el diálogo se desmonta.
  await dialog.getByRole('button', { name: /Ver resultados/ }).click();
  await expect(dialog).toHaveCount(0);
});
```

- [ ] **Step 2: Ejecutar el spec de móvil**

Run: `npm run e2e -- e2e/mobile-filters.spec.ts`
Expected: 1 passed. (El `toHaveCount(0)` espera a que el sheet termine su animación de salida y se desmonte.)

- [ ] **Step 3: Commit**

```bash
git add e2e/mobile-filters.spec.ts
git commit -m "test(e2e): bottom-sheet de filtros en móvil (abre/cierra)"
```

---

### Task 4: Job `e2e` en CI

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Añadir el job `e2e`** (paralelo al job `quality` existente)

En `.github/workflows/ci.yml`, dentro de `jobs:` (después del job `quality:`), añadir:

```yaml
  e2e:
    name: E2E (Playwright)
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run e2e
        run: npm run e2e
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}

      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

- [ ] **Step 2: Validar el YAML** (sintaxis)

Run: `npx --yes js-yaml .github/workflows/ci.yml > /dev/null && echo "YAML OK"`
Expected: `YAML OK` (sin errores de parseo). Si `js-yaml` no está disponible, abrir el archivo y revisar la indentación a mano (2 espacios, alineado con el job `quality`).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(e2e): job de Playwright (no bloqueante; usa secrets de Supabase)"
```

---

### Task 5: Verificación completa

- [ ] **Step 1: Suite unitaria intacta** (Vitest no recoge los e2e)

Run: `npm run lint; npm run typecheck; npm test`
Expected: PASS — `npm test` sigue mostrando los mismos test files de siempre (12), sin tocar `e2e/`.

- [ ] **Step 2: Suite e2e completa en local**

Run: `npm run e2e`
Expected: 4 passed (home, filtros, ficha, móvil). Confirma que `webServer` levanta la app y los 4 flujos pasan.

- [ ] **Step 2b (si algún spec es inestable):** revisar el `playwright-report/` (`npx playwright show-report`) y ajustar selectores/esperas. No marcar la tarea completa con specs en rojo.

- [ ] **Step 3: Commit** (si Step 2b tocó algo; si no, nada que commitear).

---

## Notas de implementación

- **CRLF**: no `prettier --write`. Verificar con lint + typecheck + vitest (+ los e2e).
- **`npm run e2e` compila la app** (`next build`) cada corrida → tarda 1-2 min; es normal.
- **No tocar la app**: solo se añaden ficheros de test, config y CI. Selectores semánticos;
  si faltara uno estable, añadir un `data-testid` mínimo y anotarlo (no debería hacer falta).
- **Secrets ya añadidos** en GitHub (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- **El job `e2e` no es check requerido** todavía (solo "Lint + Typecheck" lo es) → no bloquea
  el merge; el usuario lo promueve a requerido cuando lo vea estable.
- **Rama**: `feat/tests-e2e-playwright`. Al cerrar: nota de vault + bitácora.
