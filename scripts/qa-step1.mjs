import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const OUT = '/tmp/kirimure-qa';
await fs.mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleLines = [];
const errors = [];
const warnings = [];
page.on('console', (msg) => {
  const line = `[${msg.type()}] ${msg.text()}`;
  consoleLines.push(line);
  if (msg.type() === 'error') errors.push(line);
  if (msg.type() === 'warning') warnings.push(line);
});
page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));
page.on('requestfailed', (req) => consoleLines.push(`[requestfailed] ${req.url()} ${req.failure()?.errorText}`));

await page.goto('http://127.0.0.1:8080/', { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/01-map-1440.png` });

const mapData = await page.evaluate(() => {
  const map = document.querySelector('.brazil-map-screen, main, [role="main"]');
  const scroll = document.scrollingElement;
  return {
    title: document.title,
    bodyText: document.body.innerText,
    buttons: [...document.querySelectorAll('button,[role="button"]')].map((b) => ({
      text: b.textContent?.trim(),
      aria: b.getAttribute('aria-label'),
      title: b.getAttribute('title'),
      rect: b.getBoundingClientRect().toJSON(),
    })),
    overflowX: scroll ? scroll.scrollWidth > scroll.clientWidth : null,
    doc: { w: scroll?.scrollWidth, h: scroll?.scrollHeight, vw: innerWidth, vh: innerHeight },
    mapHtmlSnippet: map?.outerHTML.slice(0, 3000),
  };
});

await page.locator('g.state.available').first().click();
await page.waitForTimeout(5000);
await page.screenshot({ path: `${OUT}/02-simulation-now-1440.png` });

const simData = await page.evaluate(() => {
  const tablist = document.querySelector('[role="tablist"]');
  const scene = document.querySelector('.scene-card');
  const panel = document.querySelector('.science-panel');
  const consoleEl = document.querySelector('.teaching-console');
  const canvas = document.querySelector('canvas');
  const rect = (el) => el?.getBoundingClientRect().toJSON() ?? null;
  const allButtons = [...document.querySelectorAll('button')].map((b) => ({
    text: b.textContent?.trim(),
    aria: b.getAttribute('aria-label'),
    title: b.getAttribute('title'),
    disabled: b.disabled,
    cls: b.className,
    rect: rect(b),
  }));
  return {
    bodyText: document.body.innerText,
    tabs: tablist ? [...tablist.querySelectorAll('button')].map((b) => ({ text: b.innerText, selected: b.getAttribute('aria-selected') })) : [],
    buttons: allButtons,
    scene: rect(scene),
    panel: rect(panel),
    console: rect(consoleEl),
    canvas: rect(canvas),
    doc: { w: document.scrollingElement?.scrollWidth, h: document.scrollingElement?.scrollHeight, vw: innerWidth, vh: innerHeight },
    overflowX: document.scrollingElement.scrollWidth > document.scrollingElement.clientWidth,
    scrollY: scrollY,
    font: getComputedStyle(document.body).fontFamily,
    runtime: window.__kirimureRuntime ? {
      backend: window.__kirimureRuntime.backend,
      fish: window.__kirimureRuntime.fishes?.length,
    } : null,
  };
});

await fs.writeFile(`${OUT}/map.json`, JSON.stringify(mapData, null, 2));
await fs.writeFile(`${OUT}/simulation-now.json`, JSON.stringify(simData, null, 2));
await fs.writeFile(`${OUT}/console-step1.json`, JSON.stringify({ errors, warnings, consoleLines }, null, 2));

console.log(JSON.stringify({ map: { title: mapData.title, overflowX: mapData.overflowX, buttons: mapData.buttons.length }, sim: { overflowX: simData.overflowX, tabs: simData.tabs, scene: simData.scene, panel: simData.panel, console: simData.console, runtime: simData.runtime, buttons: simData.buttons.length }, errors, warnings: warnings.slice(0, 5) }, null, 2));

await browser.close();
