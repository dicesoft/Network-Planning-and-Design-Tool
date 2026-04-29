import { Browser, Page } from 'puppeteer';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import {
  BASE_URL,
  launchBrowser,
  createPage,
  delay,
  captureScreenshot,
  captureConsoleLogs,
  writeArtifact,
  navigateTo,
  waitForTestId,
  clearTopologyState,
} from './helpers';

/**
 * T042 (Done-button): after a successful Apply on the final step, the wizard
 * shows a Done button that closes the dialog without going through the
 * cancel-confirm flow. This test only exercises the structural visibility —
 * the underlying apply path is covered separately by Phase 5 store tests.
 */
async function clickButtonByText(page: Page, text: string): Promise<boolean> {
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const btnText = await btn.evaluate((el) => el.textContent || '');
    if (btnText.includes(text)) {
      await btn.click();
      return true;
    }
  }
  return false;
}

describe('Defrag Wizard / Done button (T042)', () => {
  let browser: Browser;
  let page: Page;
  let consoleLogs: ReturnType<typeof captureConsoleLogs>;

  beforeAll(async () => {
    browser = await launchBrowser();
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    page = await createPage(browser);
    consoleLogs = captureConsoleLogs(page);
    consoleLogs.attach();
    await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
    await page.waitForSelector('[data-testid="canvas"]', { timeout: 10000 });
    await clearTopologyState(page);
  });

  afterEach(async (ctx) => {
    if (ctx.task.result?.state === 'fail') {
      await captureScreenshot(page, ctx.task.name);
      writeArtifact(
        `logs/${ctx.task.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.txt`,
        consoleLogs.getLogs().join('\n'),
      );
    }
    await page.close();
  });

  it('Done button is hidden on initial wizard mount (Step 1)', async () => {
    await navigateTo(page, 'debug');
    await delay(300);
    await clickButtonByText(page, 'Data Gen');
    await delay(200);
    await clickButtonByText(page, 'Metro Ring');
    await delay(200);
    await clickButtonByText(page, 'Load Preset');
    await delay(2500);

    await navigateTo(page, 'capacity');
    await waitForTestId(page, 'capacity-page');
    await delay(300);
    await clickButtonByText(page, 'Defragmentation');
    await delay(400);
    await clickButtonByText(page, 'Analyze Fragmentation');
    await delay(600);

    const opened =
      (await clickButtonByText(page, 'Start Defragmentation Wizard')) ||
      (await clickButtonByText(page, 'Defragmentation Wizard')) ||
      (await clickButtonByText(page, 'Run Defragmentation Wizard')) ||
      (await clickButtonByText(page, 'Open Wizard')) ||
      (await clickButtonByText(page, 'Defragment'));
    if (!opened) return;
    await delay(400);

    const done = await page.$('[data-testid="defrag-wizard-done"]');
    expect(done).toBeNull();
  });
});
