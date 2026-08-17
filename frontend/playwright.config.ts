/**
 * Playwright E2E 配置：桌面/移动两个项目，优先复用本机 Chrome。
 */
import { existsSync } from 'node:fs';
import { chromium, defineConfig } from '@playwright/test';

const systemChromiumCandidates = [
  // 兜底候选 Chrome 路径（含各平台常见安装位置）。
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  process.env.PROGRAMFILES
    ? `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`
    : undefined,
  process.env.LOCALAPPDATA
    ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`
    : undefined,
].filter((candidate): candidate is string => Boolean(candidate));
const chromiumExecutable = existsSync(chromium.executablePath())
  ? undefined
  // Playwright 自带 Chromium 不存在时，回退到系统 Chrome。
  : systemChromiumCandidates.find((candidate) => existsSync(candidate));

export default defineConfig({
  testDir: './e2e',
  outputDir: './output/playwright/artifacts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:56789',
    browserName: 'chromium',
    locale: 'zh-CN',
    launchOptions: chromiumExecutable ? { executablePath: chromiumExecutable } : undefined,
    // 始终保留截图与 Trace：UI 自动化产物需在成功与失败两种情况下都可回看，
    // 仅失败时保留会导致通过用例丢失截图与 Trace，不符合“保留 trace 与截图”的要求。
    screenshot: 'on',
    trace: 'on',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'mobile-chromium',
      use: { viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:56789',
    reuseExistingServer: !process.env.CI,
  },
});
