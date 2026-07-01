import { test, expect } from '@playwright/test';

test('la home carga y muestra portátiles', async ({ page }) => {
  await page.goto('/');
  // Al menos una card enlaza a una ficha de portátil.
  await expect(page.locator('a[href^="/portatiles/"]').first()).toBeVisible();
  // El texto de contador de resultados aparece (o el de "sin resultados").
  await expect(page.getByText(/serie|resultado/i).first()).toBeVisible();
});

test('la sección Destacados, si aparece, muestra cards de portátil', async ({ page }) => {
  await page.goto('/');
  const destacados = page.getByRole('heading', { name: 'Destacados' });
  // Sección condicional (solo si hay curados). Si está, debe tener ≥1 card de ficha.
  if (await destacados.count()) {
    const section = page.locator('section').filter({ has: destacados });
    await expect(section.locator('a[href^="/portatiles/"]').first()).toBeVisible();
  }
});

test('la sección Novedades, si aparece, muestra cards de portátil', async ({ page }) => {
  await page.goto('/');
  const novedades = page.getByRole('heading', { name: 'Novedades' });
  if (await novedades.count()) {
    const section = page.locator('section').filter({ has: novedades });
    await expect(section.locator('a[href^="/portatiles/"]').first()).toBeVisible();
  }
});

test('la sección Chollos, si aparece, muestra cards con bajada de precio', async ({ page }) => {
  await page.goto('/');
  const chollos = page.getByRole('heading', { name: 'Chollos' });
  // Sección condicional (solo si hay bajadas). Si está, debe tener ≥1 card de ficha
  // y al menos una etiqueta de descuento "−N%".
  if (await chollos.count()) {
    const section = page.locator('section').filter({ has: chollos });
    await expect(section.locator('a[href^="/portatiles/"]').first()).toBeVisible();
    await expect(section.getByText(/−\d+%/).first()).toBeVisible();
  }
});
