// @ts-check
/** @type {import('@playwright/test').PlaywrightTestConfig} */
// 只有真正在 GitHub Actions runner 上才为 true；
// 用 GITHUB_ACTIONS 比 CI 更精准（Trae 沙箱也会预设 CI=true，但不会有 GITHUB_ACTIONS）
const isGH = process.env.GITHUB_ACTIONS === 'true';

const config = {
  testDir: './tests',
  testMatch: '**/*.e2e.spec.js',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: isGH,
  retries: isGH ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }]
  ],
  use: {
    baseURL: 'http://localhost:3000',
    viewport: { width: 1280, height: 800 },
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    // CI 用 Playwright 自带 headless chromium；本地开发复用本机 Chrome，省一次下载
    ...(isGH
      ? {
          browserName: 'chromium',
          headless: true
        }
      : {
          channel: 'chrome',
          headless: false,
          launchOptions: {
            executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            args: ['--new-window', '--no-first-run', '--no-default-browser-check']
          }
        })
  },
  projects: [
    {
      name: isGH ? 'chromium' : 'chrome-local'
    }
  ],
  // CI 自动拉起服务，本地开发手动 npm start
  webServer: isGH
    ? {
        command: 'npm start',
        port: 3000,
        reuseExistingServer: true,
        timeout: 20_000
      }
    : undefined
};

module.exports = config;
