import { test, expect } from '@playwright/test';

test('la portada carga con hero y CTA al catálogo', async ({ page }) => {
  await page.goto('/');
  // El hero (buscador) está presente.
  await expect(page.getByLabel(/Busca un portátil/)).toBeVisible();
  // El CTA lleva al catálogo completo.
  await expect(page.getByRole('link', { name: /Explorar el catálogo/ })).toBeVisible();
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
