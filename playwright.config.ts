import { defineConfig, devices } from '@playwright/test';

// Two projects (DESIGN.md 8.5). The smoke test runs in CI, where there is no GPU: it forces the
// WebGL 2 path, which headless Chrome runs on SwiftShader. The milestone shots run on a machine with a
// GPU, on the WebGPU path, in a headed browser so the GPU is used.
export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:4173',
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'smoke',
      testMatch: 'smoke.spec.ts',
      use: { launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } },
    },
    {
      name: 'shots',
      testMatch: 'shots.spec.ts',
      use: { headless: false, launchOptions: { args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] } },
    },
  ],
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
