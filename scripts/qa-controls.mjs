import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const OUT = '/tmp/kirimure-qa';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
const logs = [];
page.on('console', (m) => { logs.push(`[${m.type()}] ${m.text()}`); if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

const enter = async () => {
  await page.goto('http://127.0.0.1:8080/', { waitUntil: 'networkidle' });
  await page.locator('g.state.available').click();
  await page.waitForTimeout(2200);
};

const state = () => page.evaluate(() => {
  const rt = window.__kirimureRuntime;
  const factor = (id) => {
    const el = document.querySelector(`#factor-${id}`);
    if (!el) return null;
    return {
      value: el.value, min: el.min, max: el.max, step: el.step,
      aria: el.getAttribute('aria-label'), ariaValueText: el.getAttribute('aria-valuetext'),
      ariaValueNow: el.getAttribute('aria-valuenow'),
      card: el.closest('.direct-factor')?.innerText,
    };
  };
  return {
    readout: [...document.querySelectorAll('.environment-readout button')].map((b) => b.innerText.replace(/\n/g, ' ')),
    health: [...document.querySelectorAll('.health-overlay-items button')].map((b) => b.innerText.replace(/\n/g, ' ')),
    panel: document.querySelector('.panel-body')?.innerText.slice(0, 2400),
    factors: Object.fromEntries(['temperature', 'ph', 'microplastics', 'oil', 'sewage'].map((id) => [id, factor(id)])),
    factorsCount: document.querySelectorAll('.direct-factor').length,
    apply: (() => { const b = document.querySelector('.apply-button'); return b ? { text: b.textContent.trim(), disabled: b.disabled } : null; })(),
    notices: [...document.querySelectorAll('.factor-notice-pill')].map((el) => el.innerText),
    timeline: document.querySelector('.timeline-event')?.innerText,
    modal: document.querySelector('[role="dialog"]')?.innerText ?? null,
    runtime: rt ? {
      backend: rt.backend,
      state: {
        elapsedDays: Number(rt.state.elapsedDays.toFixed(2)),
        oxygen: Number(rt.state.dissolvedOxygen.toFixed(3)),
        env: Object.fromEntries(Object.entries(rt.state.env).map(([k, v]) => [k, Number(v.toFixed(2))])),
        targets: Object.fromEntries(Object.entries(rt.state.targets).map(([k, v]) => [k, Number(v.toFixed(2))])),
        health: { coral: Number(rt.state.health.coral.toFixed(2)), fish: Number(rt.state.health.fish.toFixed(2)) },
        overall: Number(rt.state.overall.toFixed(2)),
        pressures: Object.fromEntries(Object.entries(rt.state.pressures).map(([k, v]) => [k, Number(v.toFixed(3))])),
        dhw: Number(rt.state.degreeHeatingWeeks.toFixed(3)),
      },
      fish: rt.fishes?.length,
      visibleFish: rt.fishes?.filter((f) => f.healthy?.mesh?.isEnabled()).length,
    } : null,
  };
});

const clickSpeed = async (label) => page.locator('.speed-control button', { hasText: label }).click();
const setFactor = async (id, key) => {
  const el = page.locator(`#factor-${id}`);
  await el.focus();
  await el.press(key);
};

const out = { initial: null, factors: {}, scenarios: {}, pause: {}, speed: {}, reset: {}, massOptions: [] };
await enter();
out.initial = await state();
out.initialBody = await page.evaluate(() => document.body.innerText);
out.initialButtons = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => ({ text: b.textContent.trim(), aria: b.getAttribute('aria-label'), title: b.getAttribute('title'), disabled: b.disabled })));

// pause button behavior
out.pause.initial = await page.evaluate(() => ({ text: document.querySelector('.pause-button')?.textContent.trim(), pressed: document.querySelector('.pause-button')?.getAttribute('aria-pressed'), time: document.querySelector('.environment-readout button:last-child')?.innerText }));
await page.locator('.pause-button').click();
await page.waitForTimeout(1200);
out.pause.afterClick = await page.evaluate(() => ({ text: document.querySelector('.pause-button')?.textContent.trim(), pressed: document.querySelector('.pause-button')?.getAttribute('aria-pressed'), time: document.querySelector('.environment-readout button:last-child')?.innerText }));

// speed measurements (unpaused, no factors)
await page.locator('.pause-button').click();
for (const label of ['1x', '3x', '5x', '10x']) {
  await clickSpeed(label);
  const before = await page.evaluate(() => ({ day: window.__kirimureRuntime?.state.elapsedDays ?? null, label: document.querySelector('.speed-control button.active')?.textContent }));
  await page.waitForTimeout(2000);
  const after = await page.evaluate(() => ({ day: window.__kirimureRuntime?.state.elapsedDays ?? null }));
  out.speed[label] = { before, after, delta: before.day != null ? Number((after.day - before.day).toFixed(2)) : null };
}
// reset (this also pauses)
await page.locator('.reset-button').click();
await page.waitForTimeout(400);
out.reset.after = await state();
out.reset.timeText = await page.evaluate(() => document.querySelector('.environment-readout button:last-child')?.innerText);

// mass option cards / labels
out.massOptions = await page.evaluate(() => ['microplastics', 'oil', 'sewage'].map((id) => {
  const el = document.querySelector(`#factor-${id}`);
  return { id, min: el?.min, max: el?.max, step: el?.step, aria: el?.getAttribute('aria-label') };
}));

// test each factor extreme; reset before each
const scenarios = [
  ['temperature', 'End', 'temperatura-max'],
  ['ph', 'End', 'ph-max'],
  ['ph', 'Home', 'ph-min'],
  ['microplastics', 'End', 'microplastics-max'],
  ['oil', 'End', 'oil-max'],
  ['sewage', 'End', 'sewage-max'],
];
for (const [id, key, label] of scenarios) {
  await page.locator('.reset-button').click();
  await page.waitForTimeout(450);
  await setFactor(id, key);
  out.factors[label] = await state();
  await page.screenshot({ path: `${OUT}/control-${label}-pending.png` });
  await page.locator('.apply-button').click();
  await page.waitForTimeout(250);
  await clickSpeed('10x');
  await page.waitForTimeout(3200);
  out.scenarios[label] = await state();
  await page.screenshot({ path: `${OUT}/control-${label}-applied.png` });
}

// verify pending is discarded on reset and applied state is baseline
await page.locator('.reset-button').click();
await page.waitForTimeout(300);
out.reset.afterScenarios = await state();

// test factor slider form semantics: set mass slider to max and read all values
await setFactor('sewage', 'End');
out.massOptions.afterEnd = await state();

await fs.writeFile(`${OUT}/controls.json`, JSON.stringify({ ...out, errors, logs: logs.slice(-20) }, null, 2));
console.log(JSON.stringify({
  initial: { factors: out.initial?.factors, apply: out.initial?.apply, factorsCount: out.initial?.factorsCount },
  pause: out.pause,
  speed: out.speed,
  reset: { apply: out.reset.after?.apply, time: out.reset.timeText, runtime: out.reset.after?.runtime },
  factors: Object.fromEntries(Object.entries(out.factors).map(([k, v]) => [k, { apply: v.apply, factor: v.factors?.[k.startsWith('ph') ? 'ph' : k.split('-')[0]]?.card, timeline: v.timeline }])),
  scenarios: Object.fromEntries(Object.entries(out.scenarios).map(([k, v]) => [k, { readout: v.readout, health: v.health, notices: v.notices, timeline: v.timeline, runtime: v.runtime }])),
  massOptions: out.massOptions,
  errors,
}, null, 2));
await browser.close();
