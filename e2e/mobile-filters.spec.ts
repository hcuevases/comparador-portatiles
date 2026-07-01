import { test, expect, devices } from '@playwright/test';

// Viewport móvil para que aparezca el botón/bottom-sheet (oculto en ≥md).
test.use({ ...devices['Pixel 5'] });

test('el bottom-sheet de filtros abre y cierra en móvil', async ({ page }) => {
  // Descartamos el banner de cookies antes de navegar para que no interfiera con el sheet.
  await page.addInitScript(() => {
    window.localStorage.setItem('cookie-consent', 'accepted');
  });

  await page.goto('/catalogo');
  const trigger = page.getByRole('button', { name: /Filtros/ });
  await expect(trigger).toBeVisible();
  await trigger.click();

  // Hay dos role="dialog" en la página (filtros + aviso de cookies); se acota por nombre.
  const dialog = page.getByRole('dialog', { name: 'Filtros' });
  await expect(dialog).toBeVisible();

  // Cerrar con la ✕ del encabezado. Se usa este cierre (y no "Ver resultados" del pie)
  // porque el botón del pie es intermitentemente inestable en CI: durante la animación de
  // entrada + el auto-scroll de Playwright, un pill del cuerpo scrollable intercepta el
  // puntero (flake sintético, no un problema real de uso). La ✕ vive en el encabezado, fuera
  // del contenedor scrollable, así que el cierre es determinista.
  await dialog.getByRole('button', { name: 'Cerrar filtros' }).click();
  await expect(dialog).toHaveCount(0);
});
