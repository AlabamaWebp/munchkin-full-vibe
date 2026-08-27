import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { UI_PROJECTS } from './ui-tests/ui-matrix.mts';

const repositoryRoot = path.resolve(process.cwd());

export default defineConfig({
  testDir: './ui-tests',
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  outputDir: path.join(repositoryRoot, 'artifacts/ui/test-results'),
  snapshotPathTemplate: path.join(
    repositoryRoot,
    'artifacts/ui/baselines/{projectName}/{arg}{ext}',
  ),
  reporter: [
    ['line'],
    [
      'html',
      { outputFolder: path.join(repositoryRoot, 'artifacts/ui/playwright-report'), open: 'never' },
    ],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4200',
    browserName: 'chromium',
    colorScheme: 'dark',
    locale: 'ru-RU',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'npm run start --workspace @munchkin-lan/server',
      cwd: repositoryRoot,
      url: 'http://127.0.0.1:3000/api/status',
      reuseExistingServer: process.env['CI'] !== 'true',
      timeout: 120_000,
    },
    {
      command: 'npm run start --workspace @munchkin-lan/web',
      cwd: repositoryRoot,
      url: 'http://127.0.0.1:4200',
      reuseExistingServer: process.env['CI'] !== 'true',
      timeout: 120_000,
    },
  ],
  projects: UI_PROJECTS.map(({ name, viewport }) => ({ name, use: { viewport } })),
});
