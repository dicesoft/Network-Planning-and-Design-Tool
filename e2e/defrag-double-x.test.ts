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
 * T042 (single-X): the defrag wizard MUST render exactly one Close (X) icon
 * button — the Radix Dialog built-in. The custom secondary X has been removed.
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

async function openWizard(page: Page): Promise<boolean> {
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
    (await clickButtonByText(page, 'Start Defrag Wizard')) ||
    (await clickButtonByText(page, 'Start Defragmentation Wizard')) ||
    (await clickButtonByText(page, 'Defragmentation Wizard')) ||
    (await clickButtonByText(page, 'Run Defragmentation Wizard')) ||
    (await clickButtonByText(page, 'Open Wizard'));
  await delay(400);
  return opened;
}

describe('Defrag Wizard / Single Close button (T042)', () => {
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

  it('renders exactly one dismiss affordance (X icon OR footer Cancel) in the defrag wizard dialog', async () => {
    const opened = await openWizard(page);
    expect(opened).toBe(true);

    // The wizard MUST open — a missing dialog is a real failure, not a skip.
    const dialog = await page.$('[role="dialog"]');
    expect(dialog).not.toBeNull();

    // P2.5 — count BOTH families of dismiss affordance:
    //   1. The Radix built-in close X (sr-only "Close" text or aria-label includes "close").
    //   2. A footer "Cancel" button.
    // Per FR-007 / interpretation (a) in master-plan §1.2, exactly one of
    // these must be present per dialog (P1.1 hides the Radix X via
    // `hideClose` when a footer Cancel exists).
    const counts = await page.$$eval('[role="dialog"] button', (buttons) => {
      let xCount = 0;
      let cancelCount = 0;
      for (const b of buttons) {
        const txt = (b.textContent || '').trim().toLowerCase();
        const aria = (b.getAttribute('aria-label') || '').toLowerCase();
        const isClose = txt === 'close' || aria.includes('close');
        const isCancel = txt === 'cancel' || aria === 'cancel';
        if (isClose) xCount++;
        else if (isCancel) cancelCount++;
      }
      return { xCount, cancelCount, total: xCount + cancelCount };
    });

    expect(counts.total).toBe(1);
    // And specifically: never both at once.
    expect(counts.xCount === 0 || counts.cancelCount === 0).toBe(true);
  });
});
