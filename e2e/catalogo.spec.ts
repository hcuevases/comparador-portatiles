import { test, expect } from '@playwright/test';

test('el catálogo muestra portátiles y contador', async ({ page }) => {
  await page.goto('/catalogo');
  await expect(page.locator('a[href^="/portatiles/"]').first()).toBeVisible();
  await expect(page.getByText(/serie|resultado/i).first()).toBeVisible();
});

test('buscar en el hero de la portada lleva al catálogo filtrado', async ({ page }) => {
  await page.goto('/');
  const input = page.getByLabel(/Busca un portátil/);
  await input.fill('Lenovo');
  await input.press('Enter');
  await expect(page).toHaveURL(/\/catalogo\?q=Lenovo/i);
  // El catálogo respondió (rejilla o "sin resultados").
  await expect(page.getByText(/serie|resultado/i).first()).toBeVisible();
});
