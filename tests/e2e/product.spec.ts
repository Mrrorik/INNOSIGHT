import { test, expect, type Page } from '@playwright/test';
const root = '/api/projects/demo';
async function prepare(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('innosight-onboarded', '1');
    localStorage.setItem('innosight-project', 'demo');
  });
}
async function route(page: Page, path: string) {
  await page.goto('/#/' + path);
  await expect(page.locator('main h1')).toBeVisible();
}
test.describe.configure({ mode: 'serial' });
test.beforeEach(async ({ page, request }) => {
  await prepare(page);
  const r = await request.post(root + '/reset');
  expect(r.status()).toBe(200);
});
test('vertical chain: Playground → Proxy → stored request → coverage → SSE Dashboard', async ({
  page,
  context,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await route(page, 'overview');
  await expect(page.getByTestId('selection-coverage')).toContainText('25,3');
  const dashboard = await context.newPage();
  await prepare(dashboard);
  await route(dashboard, 'overview');
  await page.getByRole('button', { name: 'Playground', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'GraphQL Playground' })).toBeVisible();
  await page
    .locator('[data-testid="query-editor"] .cm-content')
    .fill('query BrowserDiscovery { suppliers { leadTimeDays rating } }');
  await page.getByRole('button', { name: 'Execute query' }).click();
  await expect(page.getByRole('heading', { name: 'Что обнаружила система' })).toBeVisible();
  await expect(page.locator('.discovery-grid')).toContainText('BrowserDiscovery');
  await expect(page.locator('.discovery-grid')).toContainText('+3');
  await expect(page.locator('.discovery-panel .field-chips')).toContainText('Supplier.leadTimeDays');
  const analytics = await (await request.get(root + '/analytics')).json();
  expect(analytics.metrics.observed).toBe(28);
  expect(analytics.metrics.verifiedCoverage).toBe(0);
  await expect(dashboard.getByTestId('selection-coverage')).toContainText('28,3');
  await page.getByRole('button', { name: 'Исследовать запрос' }).click();
  await expect(page.locator('table tbody')).toContainText('BrowserDiscovery');
  await page.locator('table tbody tr').first().click();
  await expect(page.getByRole('dialog')).toContainText('Supplier.rating');
  await expect(page.getByRole('dialog')).toContainText('значения');
  const event = await (await request.get(root + '/requests?search=BrowserDiscovery')).json();
  expect(event.total).toBe(1);
  expect(event.items[0].origin).toBe('live');
  expect(event.items[0].status).toBe(200);
  await context.setOffline(true);
  // Chromium offline emulation does not necessarily terminate an already-open
  // loopback SSE socket. Verify recovery of data, rather than assuming TCP closed.
  expect(await dashboard.evaluate(() => navigator.onLine)).toBe(false);
  const missed = await request.post('/proxy/demo/graphql', {
    data: { query: 'query ReconnectDiscovery { suppliers { name } }' },
  });
  expect(missed.status()).toBe(200);
  await context.setOffline(false);
  await expect(dashboard.getByTestId('selection-coverage')).toContainText('29,3');
  await dashboard.close();
  expect(errors).toEqual([]);
});
test('Test Lab executes assertions and raises verified coverage', async ({ page, request }) => {
  await route(page, 'tests');
  await page.getByRole('button', { name: 'Запустить весь набор' }).click();
  await expect(page.locator('.run-summary')).toContainText('8');
  await expect(page.locator('.run-summary .color-green')).toHaveText('8');
  await expect(page.locator('.run-results details')).toHaveCount(8);
  const a = await (await request.get(root + '/analytics')).json();
  expect(a.metrics.verifiedCoverage).toBeGreaterThan(70);
  expect(a.testRuns[0].failed).toBe(0);
  await page.locator('.run-results details').first().locator('summary').click();
  await expect(page.locator('.assertion-result').first()).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/test-lab.png', fullPage: true });
});
test('Demo Lab runs six real experiments and resets reproducibly', async ({ page, request }) => {
  await route(page, 'demo');
  await page.getByRole('button', { name: /Start Demo/ }).click();
  await expect(page.locator('.scenario-card.completed')).toHaveCount(6, { timeout: 30000 });
  await expect(page.locator('.demo-console')).toContainText('breaking changes');
  const a = await (await request.get(root + '/analytics')).json();
  expect(a.metrics.errors).toBeGreaterThan(0);
  expect(a.metrics.p95Latency).toBeGreaterThan(0);
  expect(a.changes).toHaveLength(2);
  expect(a.metrics.verifiedCoverage).toBeGreaterThan(70);
  await page.screenshot({ path: 'docs/screenshots/demo-lab.png', fullPage: true });
  await page.reload();
  await expect(page.locator('.scenario-card.completed')).toHaveCount(6);
  await page.getByRole('button', { name: 'Reset Demo' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Сбросить Demo', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const reset = await (await request.get(root + '/analytics')).json();
  expect(reset.metrics.requests).toBe(3);
  expect(reset.metrics.verifiedCoverage).toBe(0);
});
test('Graph Universe displays actual schema, searches, filters, selects and auto layouts', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await route(page, 'graph');
  await expect(page.locator('.react-flow__node')).toHaveCount(16);
  await page.getByRole('textbox', { name: 'Найти тип или поле…' }).fill('Product');
  await expect(page.locator('.schema-node.dim')).not.toHaveCount(0);
  await page.getByRole('textbox', { name: 'Найти тип или поле…' }).fill('');
  await page
    .locator('.react-flow__node')
    .filter({ has: page.locator('.schema-node-head strong', { hasText: /^Product$/ }) })
    .locator('.schema-node-head')
    .click();
  await expect(page.locator('.graph-type-panel')).toContainText('Product');
  await page.locator('.graph-type-panel').getByRole('button').filter({ hasText: 'price' }).first().click();
  await expect(page.getByRole('dialog')).toContainText('Product.price');
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  const product = page.locator('.react-flow__node[data-id="Product"]');
  const previousPosition = await product.getAttribute('style');
  await page.getByRole('button', { name: 'Автокомпоновка' }).click();
  await expect.poll(() => product.getAttribute('style')).not.toBe(previousPosition);
  await page.getByRole('button', { name: 'Reset View', exact: true }).click();
  await expect(page.locator('.react-flow__minimap-node')).toHaveCount(16);
  const previousViewport = await page.locator('.react-flow__viewport').getAttribute('style');
  await page.locator('.react-flow__controls-zoomin').click();
  await expect
    .poll(() => page.locator('.react-flow__viewport').getAttribute('style'))
    .not.toBe(previousViewport);
  await page.getByRole('button', { name: 'На весь экран', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.getByRole('button', { name: 'На весь экран', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  await page.getByLabel('Статус полей графа').selectOption('unseen');
  await page.getByRole('button', { name: 'Reset View', exact: true }).click();
  await page.screenshot({ path: 'docs/screenshots/graph-universe.png', fullPage: true });
  expect(errors).toEqual([]);
});
test('Change Impact and exports contain real observed operation evidence', async ({ page, request }) => {
  await request.post(root + '/demo/traffic');
  await route(page, 'changes');
  await page.getByRole('button', { name: 'Показать breaking changes' }).click();
  await expect(page.locator('.changes-list article')).toHaveCount(2);
  await expect(page.locator('.changes-list')).toContainText('User.email');
  await expect(page.locator('.changes-list')).toContainText('Customers');
  await route(page, 'reports');
  await page.getByRole('textbox', { name: 'Название контрольной точки' }).fill('Browser baseline');
  await page.getByRole('button', { name: 'Сохранить snapshot' }).click();
  await expect(page.locator('table')).toContainText('Browser baseline');
  await request.post(root + '/tests/run');
  await page.getByRole('textbox', { name: 'Название контрольной точки' }).fill('Browser verified');
  await page.getByRole('button', { name: 'Сохранить snapshot' }).click();
  await expect(page.locator('.snapshot-comparison')).toContainText('Browser verified');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Скачать CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('innosight-coverage.csv');
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Открыть отчёт' }).click();
  const report = await popupPromise;
  await expect(report.getByRole('heading', { name: 'Nexus Commerce' })).toBeVisible();
  await expect(report.locator('body')).toContainText('Методология');
  await report.close();
});
test('a registered test without assertions fails and does not increase verified coverage', async ({
  page,
  request,
}) => {
  await route(page, 'tests');
  await page.getByRole('button', { name: 'Добавить тест' }).click();
  await page.locator('.test-create input').fill('Browser no assertions');
  await page
    .locator('.test-create textarea')
    .first()
    .fill('query NoAssertions { suppliers { leadTimeDays } }');
  await page.locator('.test-create textarea').nth(1).fill('[]');
  await page.getByRole('button', { name: 'Зарегистрировать', exact: true }).click();
  await expect(page.locator('.test-case').filter({ hasText: 'Browser no assertions' })).toBeVisible();
  await page.getByRole('button', { name: 'Запустить Browser no assertions', exact: true }).click();
  await expect(page.locator('.run-summary .color-red')).toHaveText('1');
  const a = await (await request.get(root + '/analytics')).json();
  expect(a.metrics.verifiedCoverage).toBe(0);
  expect(a.testRuns[0].results[0].assertions).toEqual([]);
  await request.post(root + '/reset');
});
test('responsive navigation, all routes and browser console remain healthy', async ({ page }) => {
  const errors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of [
      'overview',
      'captures',
      'graph',
      'requests',
      'coverage',
      'risks',
      'tests',
      'playground',
      'demo',
      'changes',
      'reports',
      'business',
      'settings',
    ]) {
      await route(page, name);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${name} at ${width}px must not overflow`,
      ).toBe(true);
    }
    if (width === 390) {
      await page.getByRole('button', { name: 'Меню', exact: true }).click();
      await page.locator('nav').getByRole('button', { name: 'Demo Lab', exact: false }).click();
      await expect(page.getByRole('heading', { name: 'Demo Lab' })).toBeVisible();
      await page.screenshot({ path: 'docs/screenshots/mobile-demo.png', fullPage: true });
    }
  }
  expect(errors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('utility actions: clipboard, keyboard navigation, ROI assumptions and schema refresh', async ({
  page,
  context,
  request,
}) => {
  await route(page, 'playground');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page
    .locator('.playground-endpoint')
    .getByRole('button', { name: 'Скопировать', exact: true })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('/proxy/demo/graphql');
  await page.keyboard.press('Control+k');
  await page.getByRole('textbox', { name: 'Куда перейти?' }).fill('Business');
  await page
    .getByRole('dialog', { name: 'Быстрый переход' })
    .getByRole('button', { name: /Business Impact/ })
    .click();
  await expect(page.getByRole('heading', { name: 'Оценка эффекта' })).toBeVisible();
  const previous = await page.locator('.roi-result>strong').innerText();
  await page.getByRole('slider', { name: 'Размер команды', exact: true }).focus();
  await page.keyboard.press('Home');
  await expect(page.locator('.roi-result>strong')).not.toHaveText(previous);
  await route(page, 'settings');
  const before = await (await request.get(root + '/schemas')).json();
  await page.getByRole('button', { name: 'Обновить schema introspection' }).click();
  await expect(page.getByRole('status')).toContainText('Схема обновлена');
  const after = await (await request.get(root + '/schemas')).json();
  expect(after.items.length).toBe(before.items.length);
  expect(after.items[0].hash).toBe(before.items[0].hash);
});

test('external automated test run: token → real proxy → isolated coverage → live UI → export', async ({
  page,
  request,
}) => {
  await route(page, 'captures');
  await page.getByRole('textbox', { name: 'Название прогона', exact: true }).fill('Browser CI regression');
  const issued = page.waitForResponse(
    (r) => r.url().endsWith('/captures') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Создать прогон', exact: true }).click();
  const session = await (await issued).json();
  await expect(page.getByTestId('capture-coverage')).toHaveText('0%');
  await expect(page.locator('.capture-connection')).toContainText(session.token);
  const result = await request.post('/proxy/demo/graphql', {
    headers: { 'X-Innosight-Capture': session.token },
    data: { query: 'query BrowserCI {users{id name}}' },
  });
  expect(result.status()).toBe(200);
  expect((await result.json()).data.users[0].id).toBe('u1');
  await expect(page.getByTestId('capture-coverage')).toHaveText('3%');
  await expect(page.locator('.capture-stat-grid')).toContainText('3 / 99');
  await page.getByLabel('Поля прогона').selectOption('selected');
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await expect(page.locator('tbody')).toContainText('User.name');
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'JSON', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('innosight-test-capture.json');
  await page.screenshot({ path: 'docs/screenshots/test-captures.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'docs/screenshots/mobile-captures.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Завершить прогон', exact: true }).click();
  await expect(page.locator('.capture-history')).toContainText('Завершён');
  const refused = await request.post('/proxy/demo/graphql', {
    headers: { 'X-Innosight-Capture': session.token },
    data: { query: '{users{id}}' },
  });
  expect(refused.status()).toBe(409);
  await page.getByRole('button', { name: 'События прогона' }).click();
  await expect(page.locator('tbody')).toContainText('BrowserCI');
  const analytics = await (await request.get(root + '/analytics')).json();
  expect(analytics.metrics.verifiedCoverage).toBe(0);
});

test('light and dark themes persist, documentation loads, graph remains interactive', async ({ page }) => {
  await route(page, 'overview');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Тёмная тема', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByTestId('selection-coverage')).toContainText('25,3');
  await page.screenshot({ path: 'docs/screenshots/dashboard-dark.png', fullPage: true });
  await route(page, 'graph');
  await expect(page.locator('.react-flow__minimap-node')).toHaveCount(16);
  await page.getByRole('button', { name: 'Светлая тема', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.goto('/START_HERE.html');
  await expect(page.getByRole('heading', { name: 'Запуск INNOSIGHT', exact: true })).toBeVisible();
});
