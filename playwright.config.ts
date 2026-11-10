import { existsSync } from 'node:fs';
import { chromium, defineConfig } from '@playwright/test';

function resolveBrowserChannel(): 'chrome' | 'msedge' | undefined {
  try {
    if (existsSync(chromium.executablePath())) {
      return undefined;
    }
  } catch {
    // Bundled Playwright browser not installed locally
  }

  const chromePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `${process.env.LOCALAPPDATA ?? ''}\\Google\\Chrome\\Application\\chrome.exe`,
  ];
  if (chromePaths.some((p) => existsSync(p))) {
    return 'chrome';
  }

  const edgePaths = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  if (edgePaths.some((p) => existsSync(p))) {
    return 'msedge';
  }

  return undefined;
}

const channel = resolveBrowserChannel();

// SwiftShader é o fallback portátil para CI sem GPU. Em Windows com Chrome
// instalado, usar a GPU real evita que a cena ultra rode a ~1 FPS e transforme
// testes de UI em timeouts de dezenas de segundos.
const useHardwareGpu = process.platform === 'win32' && channel === 'chrome' && !process.env.CI;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    channel,
    headless: true,
    launchOptions: {
      args: useHardwareGpu
        ? ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist']
        : ['--use-gl=angle', '--use-angle=swiftshader'],
    },
  },
  webServer: {
    command: 'npx vite --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
