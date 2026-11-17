// @ts-check
const { existsSync } = require('fs');
const { defineConfig } = require('@playwright/test');

// CI（GitHub Actions 会自动注入 CI=true）统一使用 Playwright 自带 Chromium；
// 本地开发复用本机已安装的 Chrome，避免额外下载浏览器。
const isCI = String(process.env.CI).toLowerCase() === 'true';

// 本机 Chrome 路径：仅在非 CI 且文件真实存在时启用，
// 否则回退到 Playwright 自带的 chromium，避免写死路径导致 "Executable doesn't exist"。
const WIN_CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const localChrome =
  !isCI && process.platform === 'win32' && existsSync(WIN_CHROME) ? WIN_CHROME : null;

module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/*.e2e.spec.js',
  outputDir: 'test-results',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
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
    headless: isCI,
    // 本地：走本机 Chrome；CI：不指定 channel/executablePath，使用
    // `npx playwright install chromium` 安装的自带 Chromium。
    ...(localChrome
      ? {
          channel: 'chrome',
          launchOptions: {
            executablePath: localChrome,
            args: ['--new-window', '--no-first-run', '--no-default-browser-check']
          }
        }
      : { browserName: 'chromium' })
  },
  projects: [
    {
      name: localChrome ? 'chrome-local' : 'chromium'
    }
  ],
  // 无论本地还是 CI 都由 Playwright 兜底拉起服务；
  // 本地已有服务时直接复用，CI 上强制自己启动，避免误用残留进程。
  // 用接口地址而非端口探测，确保路由真正就绪，消除启动竞态。
  webServer: {
    command: 'npm start',
    url: 'http://localhost:3000/api/status',
    reuseExistingServer: !isCI,
    timeout: 20_000
  }
});
