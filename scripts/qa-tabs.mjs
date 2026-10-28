import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const OUT = '/tmp/kirimure-qa';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
const errors = [];
page.on('console', (m) => { logs.push(`[${m.type()}] ${m.text()}`); if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
await page.goto('http://127.0.0.1:8080/', { waitUntil: 'networkidle' });
await page.locator('g.state.available').click();
await page.waitForTimeout(3000);

const tabs = {};
for (const tab of ['Agora', 'Indicadores', 'Espécies', 'Histórico', 'Desafios']) {
  await page.getByRole('tab', { name: tab }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/tab-${tab}.png` });
  tabs[tab] = await page.evaluate(() => {
    const panel = document.querySelector('.panel-body');
    const isMobile = innerWidth <= 900;
    return {
      text: panel?.innerText,
      scroll: panel ? { scrollTop: panel.scrollTop, scrollHeight: panel.scrollHeight, clientHeight: panel.clientHeight, overflow: getComputedStyle(panel).overflowY } : null,
      scrollPage: isMobile ? { y: scrollY, height: document.documentElement.scrollHeight, vh: innerHeight } : null,
      challenges: [...document.querySelectorAll('.challenge-card')].map((b) => ({ text: b.innerText, cls: b.className, pressed: b.getAttribute('aria-pressed'), disabled: b.disabled })),
    };
  });
}

// each readout / health modal
const modals = {};
const triggers = [
  ['temperature', '.environment-readout button:nth-child(1)'],
  ['ph', '.environment-readout button:nth-child(2)'],
  ['dhw', '.environment-readout button:nth-child(3)'],
  ['dissolvedOxygen', '.environment-readout button:nth-child(4)'],
  ['time', '.environment-readout button:nth-child(5)'],
  ['overall', '.health-overlay-items button:nth-child(1)'],
  ['coral', '.health-overlay-items button:nth-child(2)'],
  ['fish', '.health-overlay-items button:nth-child(3)'],
];
await page.getByRole('tab', { name: 'Agora' }).click();
for (const [id, sel] of triggers) {
  await page.locator(sel).click();
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/modal-${id}.png` });
  modals[id] = await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    const close = document.querySelector('.indicator-modal-close');
    return {
      title: dlg?.querySelector('.indicator-modal-title')?.textContent,
      current: dlg?.querySelector('.indicator-modal-current')?.textContent,
      text: dlg?.innerText,
      activeElement: document.activeElement?.className,
      closeRect: close?.getBoundingClientRect().toJSON(),
      dialogRect: dlg?.getBoundingClientRect().toJSON(),
      bodyOverflow: getComputedStyle(document.body).overflow,
    };
  });
  // close by backdrop to avoid depending on button
  await page.locator('.indicator-modal-backdrop').click({ position: { x: 8, y: 8 } });
  await page.waitForTimeout(100);
}

// test escape and focus return
await page.locator('.environment-readout button:nth-child(1)').click();
await page.waitForTimeout(100);
const focusOnOpen = await page.evaluate(() => ({ tag: document.activeElement?.tagName, cls: document.activeElement?.className }));
await page.keyboard.press('Escape');
await page.waitForTimeout(100);
const focusAfterEscape = await page.evaluate(() => ({ tag: document.activeElement?.tagName, cls: document.activeElement?.className, modal: Boolean(document.querySelector('[role="dialog"]')) }));

// tab keyboard behavior
await page.getByRole('tab', { name: 'Agora' }).focus();
await page.keyboard.press('ArrowRight');
const tabAfterArrow = await page.evaluate(() => ({ focused: document.activeElement?.textContent?.trim(), selected: document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim() }));

await fs.writeFile(`${OUT}/tabs.json`, JSON.stringify({ tabs, modals, focusOnOpen, focusAfterEscape, tabAfterArrow, errors, logs: logs.slice(-20) }, null, 2));
console.log(JSON.stringify({ tabs: Object.fromEntries(Object.entries(tabs).map(([k, v]) => [k, { text: v.text?.slice(0, 2000), scroll: v.scroll, challenges: v.challenges }])), modalTitles: Object.fromEntries(Object.entries(modals).map(([k, v]) => [k, { title: v.title, current: v.current }])), focusOnOpen, focusAfterEscape, tabAfterArrow, errors }, null, 2));
await browser.close();
