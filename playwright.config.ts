import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  use: { headless: false, viewport: { width: 1600, height: 950 } },
  reporter: 'line',
  workers: 1,
});
