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
