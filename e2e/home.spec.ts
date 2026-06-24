import { test, expect } from '@playwright/test';

test('la home carga y muestra portátiles', async ({ page }) => {
  await page.goto('/');
  // Al menos una card enlaza a una ficha de portátil.
  await expect(page.locator('a[href^="/portatiles/"]').first()).toBeVisible();
  // El texto de contador de resultados aparece (o el de "sin resultados").
  await expect(page.getByText(/serie|resultado/i).first()).toBeVisible();
});
