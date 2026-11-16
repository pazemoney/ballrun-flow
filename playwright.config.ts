import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

// Chromium pré-instalado no ambiente de desenvolvimento; no CI usa o baixado pelo Playwright.
const localChromium = '/opt/pw-browsers/chromium';
const gl = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const launch = existsSync(localChromium) && !process.env.CI ? { executablePath: localChromium, args: gl } : { args: gl };

const projects = [
  { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, launchOptions: launch } },
  { name: 'pixel7', use: { ...devices['Pixel 7'], launchOptions: launch } },
  { name: 'iphone12', use: { ...devices['iPhone 12'], defaultBrowserType: 'chromium' as const, launchOptions: launch } },
];
// Safari de verdade (WebKit) quando instalado: `npx playwright install webkit` (o CI faz isso)
if (process.env.WEBKIT) projects.push({ name: 'iphone12-webkit', use: { ...devices['iPhone 12'] } as never });

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 3,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173', trace: 'off', screenshot: 'only-on-failure' },
  webServer: { command: 'npx vite preview --port 4173 --strictPort', port: 4173, reuseExistingServer: true, timeout: 60_000 },
  projects,
});
