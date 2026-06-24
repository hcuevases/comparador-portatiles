import { test, expect, devices } from '@playwright/test';

// Viewport móvil para que aparezca el botón/bottom-sheet (oculto en ≥md).
test.use({ ...devices['Pixel 5'] });

test('el bottom-sheet de filtros abre y cierra en móvil', async ({ page }) => {
  // El banner de cookies (role="dialog") está en z-50 y cubre el pie del sheet;
  // lo descartamos antes de navegar para que no intercepte el clic en "Ver resultados".
  await page.addInitScript(() => {
    window.localStorage.setItem('cookie-consent', 'accepted');
  });

  await page.goto('/');
  const trigger = page.getByRole('button', { name: /Filtros/ });
  await expect(trigger).toBeVisible();
  await trigger.click();

  // Hay dos role="dialog" en la página (filtros + aviso de cookies); se acota por nombre.
  const dialog = page.getByRole('dialog', { name: 'Filtros' });
  await expect(dialog).toBeVisible();

  // Cerrar con "Ver resultados" → el diálogo se desmonta.
  await dialog.getByRole('button', { name: /Ver resultados/ }).click();
  await expect(dialog).toHaveCount(0);
});
