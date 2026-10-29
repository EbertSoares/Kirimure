import { expect, test } from '@playwright/test';

test.describe('Kirimurê — Refinamento UI/UX Graphite & Sage', () => {
  test('desktop (1440×900): logo centralizada, rolagem dos menus suspensos, indicadores translúcidos e relógio 10×', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    // 1. Entrada direta no laboratório com logo centralizada no header
    const topbar = page.locator('.lab-topbar');
    await expect(topbar).toBeVisible();

    const headerLogo = topbar.locator('.lab-topbar-center .brand-logo');
    await expect(headerLogo).toBeVisible();
    const logoBox = await headerLogo.boundingBox();
    expect(logoBox).not.toBeNull();
    expect(Math.abs(logoBox!.x + logoBox!.width / 2 - 720)).toBeLessThan(12);

    // 2. Localização por extenso e ausência de funcionalidades removidas
    const regionTrigger = page.locator('.region-trigger');
    await expect(regionTrigger).toContainText('Baía de Todos-os-Santos');
    await expect(regionTrigger).toContainText('Ilha dos Frades e Itaparica');
    await expect(topbar).not.toContainText('BTS');
    await expect(page.getByRole('button', { name: /Guardar/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Comparar/i })).toHaveCount(0);

    // 3. Indicadores minimalistas: percentual (%) para saúde e unidades científicas para físicos
    const telemetry = page.locator('.contextual-telemetry-bar');
    await expect(telemetry).toBeVisible();
    await expect(telemetry).toContainText('Corais');
    await expect(telemetry).toContainText('100%');
    await expect(telemetry).toContainText('Peixes');
    await expect(telemetry).toContainText('Oxigênio');
    await expect(telemetry).toContainText('mg/L');
    await expect(telemetry).not.toContainText('100/100');
    await expect(telemetry).not.toContainText('Comunidade ativa');

    const progressBars = telemetry.locator('[role="progressbar"]');
    await expect(progressBars).toHaveCount(2);
    await expect(progressBars.first()).toHaveAttribute('aria-valuenow', '100');

    // 4. Seletor de região alimentado por BTS_SECTORS + fechamento e foco via Escape
    await regionTrigger.click();
    const regionPopover = page.locator('.region-menu');
    await expect(regionPopover).toBeVisible();
    await expect(regionPopover).toContainText('Escolher região');
    await expect(regionPopover.locator('.region-option')).toHaveCount(3);

    await regionPopover.getByText('Estuário do Paraguaçu', { exact: true }).click();
    await expect(regionPopover).toBeHidden();
    await expect(regionTrigger).toContainText('Estuário do Paraguaçu');

    await regionTrigger.click();
    await expect(regionPopover).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(regionPopover).toBeHidden();
    await expect(regionTrigger).toBeFocused();

    // 5. Painel Ajustar: atualização contextual e rolagem real do menu suspenso
    const adjustBtn = topbar.getByRole('button', { name: 'Ajustar', exact: true });
    await adjustBtn.click();
    const envDrawer = page.locator('.env-drawer');
    await expect(envDrawer).toBeVisible();

    const tempSlider = envDrawer.locator('input[type="range"]').first();
    await tempSlider.fill('30.2');
    await tempSlider.dispatchEvent('change');
    await expect(telemetry).toContainText('Temperatura');
    await expect(telemetry).toContainText('°C');
    await expect(telemetry).toContainText('Estresse térmico');

    // Expande Poluição e Ecossistema para testar a rolagem real com roda do mouse
    await envDrawer.getByRole('button', { name: /Poluição/i }).click();
    await envDrawer.getByRole('button', { name: /Ecossistema/i }).click();
    const envBody = envDrawer.locator('.env-drawer-body');
    const envBodyBox = await envBody.boundingBox();
    expect(envBodyBox).not.toBeNull();
    await page.mouse.move(envBodyBox!.x + envBodyBox!.width / 2, envBodyBox!.y + envBodyBox!.height / 2);
    await page.mouse.wheel(0, 360);
    await expect.poll(async () => envBody.evaluate((el) => el.scrollTop)).toBeGreaterThan(80);

    // 6. Painel Dados: somente abas Evolução e Dados + rolagem real do menu suspenso
    const dataBtn = topbar.getByRole('button', { name: 'Dados', exact: true });
    await dataBtn.click();
    const evidenceDrawer = page.locator('.evidence-drawer');
    await expect(evidenceDrawer).toBeVisible();
    const tabs = evidenceDrawer.locator('[role="tab"]');
    await expect(tabs).toHaveCount(2);
    await expect(tabs.nth(0)).toHaveText('Evolução');
    await expect(tabs.nth(1)).toHaveText('Dados');

    await tabs.nth(1).click();
    const evidenceBody = evidenceDrawer.locator('.evidence-body');
    const evBodyBox = await evidenceBody.boundingBox();
    expect(evBodyBox).not.toBeNull();
    await page.mouse.move(evBodyBox!.x + evBodyBox!.width / 2, evBodyBox!.y + evBodyBox!.height / 2);
    await page.mouse.wheel(0, 360);
    await expect.poll(async () => evidenceBody.evaluate((el) => el.scrollTop)).toBeGreaterThan(80);

    await page.keyboard.press('Escape');
    await expect(evidenceDrawer).toBeHidden();

    // 7. Relógio reposicionado e velocidade 10× (~5 dias/s)
    const timeBar = page.locator('.time-execution-bar');
    await expect(timeBar).toBeVisible();
    const clockReadout = timeBar.locator('.sim-clock-readout strong');
    const speed10Btn = timeBar.locator('.speed-pills button', { hasText: '10×' });
    await speed10Btn.click();
    await expect(speed10Btn).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(1300);
    const clockText = (await clockReadout.textContent()) ?? '';
    const daysMatch = clockText.match(/(\d+)/);
    expect(Number(daysMatch?.[1] ?? '0')).toBeGreaterThanOrEqual(4);

    // 8. Voltar ao mapa do Brasil e retornar selecionando a Bahia
    const mapReturnBtn = topbar.locator('.map-return-btn');
    await expect(mapReturnBtn).toBeVisible();
    await mapReturnBtn.click();
    const mapScreen = page.locator('.map-screen');
    await expect(mapScreen).toBeVisible();

    const bahiaState = mapScreen.locator('.state.available').first();
    await expect(bahiaState).toBeVisible();
    await bahiaState.click();
    await expect(topbar).toBeVisible();
  });

  test('mobile (390×844): logo centralizada, controles sem cortes, rolagem em bottom sheet e scrim', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const topbar = page.locator('.lab-topbar');
    await expect(topbar).toBeVisible();

    const headerLogo = topbar.locator('.lab-topbar-center .brand-logo');
    const logoBox = await headerLogo.boundingBox();
    expect(logoBox).not.toBeNull();
    expect(Math.abs(logoBox!.x + logoBox!.width / 2 - 195)).toBeLessThan(12);

    // Verifica que botões temporais reposicionados cabem na largura de 390 px sem corte horizontal
    const timeBar = page.locator('.time-execution-bar');
    const playPauseBtn = timeBar.locator('.play-pause-btn');
    const playBox = await playPauseBtn.boundingBox();
    expect(playBox).not.toBeNull();
    expect(playBox!.height).toBeGreaterThanOrEqual(42);
    expect(playBox!.x).toBeGreaterThanOrEqual(0);

    const speed10Btn = timeBar.locator('.speed-pills button', { hasText: '10×' });
    const speed10Box = await speed10Btn.boundingBox();
    expect(speed10Box).not.toBeNull();
    expect(speed10Box!.x + speed10Box!.width).toBeLessThanOrEqual(390);

    // Dock inferior flutuante com 2 ações principais >= 48 px de altura
    const mobileDock = page.locator('.mobile-panel-dock');
    await expect(mobileDock).toBeVisible();
    const dockAdjustBtn = mobileDock.getByRole('button', { name: /Ajustar/i });
    const dockDataBtn = mobileDock.getByRole('button', { name: /Dados/i });

    const adjustBox = await dockAdjustBtn.boundingBox();
    const dataBox = await dockDataBtn.boundingBox();
    expect(adjustBox!.height).toBeGreaterThanOrEqual(48);
    expect(dataBox!.height).toBeGreaterThanOrEqual(48);

    // Abre bottom sheet Ajustar, verifica rolagem interna sem cortar sliders e fecha no scrim
    await dockAdjustBtn.click();
    const envDrawer = page.locator('.env-drawer');
    const scrim = page.locator('.drawer-scrim');
    await expect(envDrawer).toBeVisible();
    await expect(scrim).toBeVisible();
    await expect(envDrawer.locator('.env-drawer-mobile-actions')).toBeVisible();

    const envBody = envDrawer.locator('.env-drawer-body');
    const envBodyBox = await envBody.boundingBox();
    expect(envBodyBox).not.toBeNull();
    await page.mouse.move(envBodyBox!.x + envBodyBox!.width / 2, envBodyBox!.y + envBodyBox!.height / 2);
    await page.mouse.wheel(0, 220);
    await expect.poll(async () => envBody.evaluate((el) => el.scrollTop)).toBeGreaterThan(40);

    // Clica na parte superior do scrim (acima do bottom sheet de max 72dvh)
    await page.mouse.click(195, 80);
    await expect(envDrawer).toBeHidden();

    // Abre bottom sheet Dados e fecha com Escape
    await dockDataBtn.click();
    const evidenceDrawer = page.locator('.evidence-drawer');
    await expect(evidenceDrawer).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(evidenceDrawer).toBeHidden();
  });
});
