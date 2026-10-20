import { expect, test } from '@playwright/test';

test('abre a Bahia e apresenta o modo de aula simplificado', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/Kinimurê/);
  await expect(page.getByRole('heading', { name: 'Escolha um estado do Brasil' })).toBeVisible();

  await page.locator('.state.available').click();

  await expect(page.getByText('Kinimurê', { exact: true })).toBeVisible();
  await expect(page.getByText('Observe causa, efeito e tempo')).toBeVisible();
  await expect(page.getByText('Baía de Todos-os-Santos')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aplicar e observar' })).toBeDisabled();
  await expect(page.locator('#factor-oil')).toHaveAttribute('max', '50000');
});

test('alterna entre apresentação e análise sem esconder a cena', async ({ page }) => {
  await page.goto('/');
  await page.locator('.state.available').click();

  await page.getByRole('button', { name: 'Modo apresentação' }).click();
  await expect(page.getByRole('tab', { name: 'Indicadores' })).toBeVisible();
  await expect(page.locator('.marine-canvas')).toBeVisible();
});
