import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const pages = [
  { path: '/dashboard', title: '仪表盘', slug: 'dashboard', screenshot: true },
  { path: '/test-cases/api', title: '测试用例', slug: 'test-cases', screenshot: true },
  { path: '/xmind', title: '用例生成器', slug: 'xmind', screenshot: true },
  { path: '/personnel', title: '人员管理', slug: 'personnel', screenshot: true },
  { path: '/settings', title: '系统设置', slug: 'settings', screenshot: false },
] as const;

function collectBrowserErrors(page: Page) {
  const errors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('response', (response) => {
    if (response.status() >= 400 && response.url().startsWith('http://127.0.0.1:4173')) {
      errors.push(`http ${response.status()}: ${response.url()}`);
    }
  });

  return errors;
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    body: { client: document.body.clientWidth, scroll: document.body.scrollWidth },
    root: {
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    },
    app: {
      client: document.querySelector<HTMLElement>('#root')?.clientWidth ?? 0,
      scroll: document.querySelector<HTMLElement>('#root')?.scrollWidth ?? 0,
    },
  }));

  expect(dimensions.body.scroll).toBeLessThanOrEqual(dimensions.body.client);
  expect(dimensions.root.scroll).toBeLessThanOrEqual(dimensions.root.client);
  expect(dimensions.app.scroll).toBeLessThanOrEqual(dimensions.app.client);
}

async function expectTableScroll(page: Page, wrapperSelector: string) {
  const geometry = await page.locator(wrapperSelector).evaluate((element) => {
    const scrollingTable = element.querySelector<HTMLElement>('.ant-table-content');
    return {
      overflow: getComputedStyle(element).overflowX,
      client: scrollingTable?.clientWidth ?? 0,
      scroll: scrollingTable?.scrollWidth ?? 0,
    };
  });

  expect(geometry.overflow).toBe('auto');
  expect(geometry.scroll).toBeGreaterThan(geometry.client);
}

async function expectGridColumns(page: Page, selector: string, columns: number) {
  const count = await page.locator(selector).evaluate((element) =>
    getComputedStyle(element).gridTemplateColumns.split(' ').length,
  );
  expect(count).toBe(columns);
}

async function waitForDashboardChart(page: Page) {
  const chart = page.locator('.dashboard-chart svg');
  await expect(chart).toBeVisible();
  await expect(page.locator('.recharts-pie-sector path')).toHaveCount(3);
  await chart.evaluate(
    (element) =>
      new Promise<void>((resolve, reject) => {
        let frames = 0;
        let lastSignature = '';
        let stableFrames = 0;

        const check = () => {
          const paths = Array.from(element.querySelectorAll<SVGPathElement>('.recharts-pie-sector path'));
          const signature = paths.map((path) => path.getAttribute('d')).join('|');
          stableFrames = paths.length === 3 && signature === lastSignature ? stableFrames + 1 : 0;
          lastSignature = signature;
          frames += 1;

          if (stableFrames >= 5) {
            resolve();
          } else if (frames >= 240) {
            reject(new Error('仪表盘图表未在 240 帧内稳定'));
          } else {
            requestAnimationFrame(check);
          }
        };

        requestAnimationFrame(check);
      }),
  );
}

test('桌面端可从仪表盘导航到用例生成器和人员管理', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const browserErrors = collectBrowserErrors(page);

  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: '仪表盘' })).toBeVisible();
  await page.getByRole('menuitem', { name: '用例生成器' }).click();
  await expect(page.getByRole('heading', { name: '用例生成器' })).toBeVisible();
  await page.getByRole('menuitem', { name: '人员管理' }).click();
  await expect(page.getByRole('heading', { name: '人员管理' })).toBeVisible();

  expect(browserErrors).toEqual([]);
});

test('仪表盘用例图表绘制三个非零扇区', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');

  await page.goto('/dashboard');
  await expect(page.getByText('用例总数')).toBeVisible();
  await waitForDashboardChart(page);
  const chart = page.locator('.dashboard-chart svg');
  const geometry = await chart.evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    height: element.getBoundingClientRect().height,
    sectors: Array.from(element.querySelectorAll<SVGPathElement>('.recharts-pie-sector path')).map((sector) => {
      const box = sector.getBBox();
      const style = getComputedStyle(sector);
      return {
        d: sector.getAttribute('d'),
        fill: style.fill,
        opacity: style.opacity,
        width: box.width,
        height: box.height,
        length: sector.getTotalLength(),
      };
    }),
  }));
  expect(geometry.width).toBe(148);
  expect(geometry.height).toBe(148);
  expect(geometry.sectors).toHaveLength(3);
  geometry.sectors.forEach((sector) => {
    expect(sector.d).toBeTruthy();
    expect(sector.width).toBeGreaterThan(0);
    expect(sector.height).toBeGreaterThan(0);
    expect(sector.length).toBeGreaterThan(0);
    expect(sector.fill).not.toBe('none');
    expect(Number(sector.opacity)).toBeGreaterThan(0);
  });
});

test('移动端可打开主导航并在页面间导航且内容不溢出或重叠', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  const browserErrors = collectBrowserErrors(page);

  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: '仪表盘' })).toBeVisible();
  await page.getByRole('button', { name: '打开导航' }).click();
  const navigation = page.getByRole('dialog', { name: '主导航' });
  await expect(navigation).toBeVisible();
  await navigation.getByRole('menuitem', { name: '用例生成器' }).click();
  await expect(page.getByRole('heading', { name: '用例生成器' })).toBeVisible();

  await page.getByRole('button', { name: '打开导航' }).click();
  await page.getByRole('dialog', { name: '主导航' }).getByRole('menuitem', { name: '人员管理' }).click();
  const heading = page.getByRole('heading', { name: '人员管理' });
  const addUser = page.getByRole('button', { name: '添加用户' });
  await expect(heading).toBeVisible();
  await expect(addUser).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const [headingBox, buttonBox] = await Promise.all([heading.boundingBox(), addUser.boundingBox()]);
  expect(headingBox).not.toBeNull();
  expect(buttonBox).not.toBeNull();
  expect(headingBox!.y + headingBox!.height).toBeLessThanOrEqual(buttonBox!.y);
  expect(buttonBox!.x + buttonBox!.width).toBeLessThanOrEqual(390);
  expect(browserErrors).toEqual([]);
});

test('移动端长按钮文案在受限宽度内换行且不溢出', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');

  await page.goto('/dashboard');
  const button = page.getByRole('button', { name: '从 XMind 生成用例' });
  await expect(button).toBeVisible();
  const geometry = await button.evaluate((element) => {
    element.style.width = '120px';
    element.style.maxWidth = '120px';
    const label = Array.from(element.querySelectorAll('span')).find((span) =>
      span.textContent?.includes('从 XMind 生成用例'),
    );
    const buttonBox = element.getBoundingClientRect();
    const labelBox = label?.getBoundingClientRect();

    return {
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      button: buttonBox.toJSON(),
      label: labelBox?.toJSON(),
    };
  });

  expect(geometry.label).toBeDefined();
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
  expect(geometry.label!.left).toBeGreaterThanOrEqual(geometry.button.left);
  expect(geometry.label!.right).toBeLessThanOrEqual(geometry.button.right);
  expect(geometry.label!.top).toBeGreaterThanOrEqual(geometry.button.top);
  expect(geometry.label!.bottom).toBeLessThanOrEqual(geometry.button.bottom);
});

test('桌面和移动端均可访问核心页面与设置并保存核心页面截图', async ({ page }, testInfo) => {
  const browserErrors = collectBrowserErrors(page);

  for (const target of pages) {
    await page.goto(target.path);
    await expect(page.getByRole('heading', { name: target.title })).toBeVisible();
    await expect(page.locator('.ant-skeleton')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    if (target.screenshot) {
      if (target.slug === 'dashboard') await waitForDashboardChart(page);
      await page.screenshot({
        path: testInfo.outputPath(`${target.slug}.png`),
        fullPage: true,
      });
    }
  }

  expect(browserErrors).toEqual([]);
});

test('桌面端可完成新建用例入口、XMind 解析和添加用户入口', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const browserErrors = collectBrowserErrors(page);

  await page.goto('/dashboard');
  await page.getByRole('button', { name: '新建接口用例' }).click();
  await expect(page.getByRole('dialog', { name: '新建接口用例' })).toBeVisible();

  await page.goto('/xmind');
  await page.getByLabel('选择 XMind 文件').setInputFiles({
    name: '登录流程.xmind',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('e2e xmind fixture'),
  });
  await expect(page.getByRole('heading', { name: '解析预览' })).toBeVisible();
  await page.getByRole('button', { name: '开始完整解析' }).click();
  await expect(page.getByRole('heading', { name: '已生成 6 条测试用例' })).toBeVisible();
  await expect(page.getByText('完整解析完成')).toBeVisible();

  await page.goto('/personnel');
  await page.getByRole('button', { name: '添加用户' }).click();
  await expect(page.getByRole('dialog', { name: '添加用户' })).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test('仪表盘在 1200、900 和 600 断点保持稳定网格与表格滚动', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const browserErrors = collectBrowserErrors(page);

  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto('/dashboard');
  await expect(page.getByText('用例总数')).toBeVisible();
  await expectGridColumns(page, '.dashboard-overview-grid', 2);
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 900, height: 900 });
  await expectGridColumns(page, '.dashboard-overview-grid', 2);
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 600, height: 900 });
  await expectGridColumns(page, '.dashboard-overview-grid', 1);
  await expectTableScroll(page, '.dashboard-table-wrap');
  await expectNoHorizontalOverflow(page);
  expect(browserErrors).toEqual([]);
});

test('XMind 预览在 1200 和 900 断点切换双列与单列', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const browserErrors = collectBrowserErrors(page);

  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto('/xmind');
  await page.getByLabel('选择 XMind 文件').setInputFiles({
    name: '断点预览.xmind',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('responsive xmind fixture'),
  });
  await expect(page.getByRole('heading', { name: '解析预览' })).toBeVisible();
  await expectGridColumns(page, '.xmind-preview__grid', 2);

  await page.setViewportSize({ width: 900, height: 900 });
  await expectGridColumns(page, '.xmind-preview__grid', 1);
  const [xmindHeaderBox, parseButtonBox] = await Promise.all([
    page.locator('.xmind-preview__header > div').boundingBox(),
    page.getByRole('button', { name: '开始完整解析' }).boundingBox(),
  ]);
  expect(xmindHeaderBox).not.toBeNull();
  expect(parseButtonBox).not.toBeNull();
  expect(xmindHeaderBox!.y + xmindHeaderBox!.height).toBeLessThanOrEqual(parseButtonBox!.y);
  await expectNoHorizontalOverflow(page);
  expect(browserErrors).toEqual([]);
});

test('测试用例在 900 和 600 断点保持模块布局、表格滚动与抽屉尺寸', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const browserErrors = collectBrowserErrors(page);

  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto('/test-cases/api');
  await expect(page.getByRole('region', { name: '接口用例列表' })).toBeVisible();
  await expect(page.locator('.ant-skeleton')).toHaveCount(0);
  await expectGridColumns(page, '.test-cases-layout', 1);
  const [modulePanelBox, caseListBox] = await Promise.all([
    page.locator('.module-panel').boundingBox(),
    page.locator('.case-list-panel').boundingBox(),
  ]);
  expect(modulePanelBox).not.toBeNull();
  expect(caseListBox).not.toBeNull();
  expect(modulePanelBox!.y + modulePanelBox!.height).toBeLessThanOrEqual(caseListBox!.y);
  await expectTableScroll(page, '.case-list-table');

  await page.setViewportSize({ width: 600, height: 900 });
  await page.getByRole('button', { name: '新建接口用例' }).click();
  const caseDrawerBox = await page.getByRole('dialog', { name: '新建接口用例' }).boundingBox();
  expect(caseDrawerBox).not.toBeNull();
  expect(caseDrawerBox!.width).toBeCloseTo(480, 1);
  await expectNoHorizontalOverflow(page);
  expect(browserErrors).toEqual([]);
});

test('人员管理在 600 断点保持单列筛选与表格滚动', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const browserErrors = collectBrowserErrors(page);

  await page.setViewportSize({ width: 600, height: 900 });
  await page.goto('/personnel');
  await expect(page.getByRole('region', { name: '用户列表' })).toBeVisible();
  await expect(page.locator('.ant-skeleton')).toHaveCount(0);
  await expectGridColumns(page, '.personnel-toolbar', 1);
  await expectTableScroll(page, '.personnel-table-scroll');
  await expectNoHorizontalOverflow(page);
  expect(browserErrors).toEqual([]);
});
