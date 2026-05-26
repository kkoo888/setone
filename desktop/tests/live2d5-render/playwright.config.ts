import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        launchOptions: {
          executablePath: '/usr/bin/chromium',
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--enable-webgl',
            '--enable-webgl2',
            '--use-gl=swiftshader',
            '--enable-features=Vulkan',
          ],
        },
      },
    },
  ],
  webServer: {
    command: 'TEST_PORT=39201 node server.mjs',
    port: 39201,
    reuseExistingServer: false,
    timeout: 10_000,
  },
})
