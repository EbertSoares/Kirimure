import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const;

async function expectNoSeriousAccessibilityViolations(page: Page, context: string) {
  const results = await new AxeBuilder({ page })
    .withTags([...WCAG_TAGS])
    .analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious',
  );

  expect(blocking, `${context}: ${JSON.stringify(blocking, null, 2)}`).toEqual([]);
}

test.describe('Kirimurê — acessibilidade WCAG', () => {
  test('mapa inicial e laboratório não têm violações críticas ou sérias', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await expect(page.locator('.map-screen')).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page, 'Mapa inicial');

    await page.locator('.state.available').first().click();
    await expect(page.locator('.lab-topbar')).toBeVisible({ timeout: 6000 });
    await expectNoSeriousAccessibilityViolations(page, 'Laboratório');
  });
});
