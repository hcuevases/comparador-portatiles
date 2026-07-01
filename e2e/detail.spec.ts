import { test, expect } from '@playwright/test';

test('abrir la ficha de un portátil desde la home', async ({ page }) => {
  await page.goto('/catalogo');
  const firstCard = page.locator('a[href^="/portatiles/"]').first();
  await expect(firstCard).toBeVisible();
  await firstCard.click();
  await expect(page).toHaveURL(/\/portatiles\//);
  // Toda ficha tiene un encabezado principal (h1) con el modelo.
  await expect(page.locator('h1').first()).toBeVisible();
});
