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

async function openSettings(page: Page): Promise<void> {
  const btn = await page.$('[data-testid="settings-button"]');
  if (!btn) throw new Error('settings-button not found in header');
  await btn.click();
  await waitForTestId(page, 'settings-dialog');
  await delay(200);
}

async function setRoadmap(page: Page, on: boolean): Promise<void> {
  await openSettings(page);
  // General is the default tab. Read current state via aria-checked.
  const checkbox = await page.$('[data-testid="settings-show-roadmap"]');
  if (!checkbox) throw new Error('settings-show-roadmap checkbox not found');
  const checked = await checkbox.evaluate(
    (el) => el.getAttribute('aria-checked') === 'true' || (el as HTMLInputElement).checked === true,
  );
  if (checked !== on) {
    // Radix Checkbox root may not be directly clickable via element bounding box.
    // Use a synthetic click via the DOM, then dispatch the keyboard space (Radix listens to it).
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="settings-show-roadmap"]') as HTMLElement | null;
      el?.focus();
    });
    await page.keyboard.press('Space');
    await delay(200);
  }
  // Apply
  const apply = await page.$('[data-testid="settings-apply-btn"]');
  if (apply) {
    const disabled = await apply.evaluate((el) => (el as HTMLButtonElement).disabled);
    if (!disabled) {
      await apply.click();
      await delay(300);
    } else {
      // Already in desired state — close via Esc
      await page.keyboard.press('Escape');
      await delay(200);
    }
  }
  // Ensure dialog dismissed
  await delay(200);
  const stillOpen = await page.$('[data-testid="settings-dialog"]');
  if (stillOpen) {
    await page.keyboard.press('Escape');
    await delay(200);
  }
}

async function bodyTextContains(page: Page, needle: string): Promise<boolean> {
  const text = await page.evaluate(() => document.body.textContent || '');
  return text.includes(needle);
}

describe('Roadmap toggle (T081 — US6)', () => {
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

  it('hides Coming Soon entries when toggle is OFF and reveals them when ON', async () => {
    // Default state per FR-027 is OFF in release builds. Force OFF to be deterministic.
    await setRoadmap(page, false);

    // Topology editor: NodePalette must NOT show olt or ont entries
    await navigateTo(page, 'topology');
    await waitForTestId(page, 'node-palette');
    await delay(200);
    const oltOff = await page.$('[data-testid="palette-olt"]');
    const ontOff = await page.$('[data-testid="palette-ont"]');
    expect(oltOff).toBeNull();
    expect(ontOff).toBeNull();

    // Reports library: no "Coming Soon" badge text visible
    await navigateTo(page, 'reports');
    await waitForTestId(page, 'reports-page');
    await delay(300);
    expect(await bodyTextContains(page, 'Coming Soon')).toBe(false);

    // Tools page: no "Coming Soon" badge text visible
    await navigateTo(page, 'tools');
    await waitForTestId(page, 'tools-page');
    await delay(300);
    expect(await bodyTextContains(page, 'Coming Soon')).toBe(false);

    // Flip the toggle ON, then verify the same surfaces now reveal stubs.
    await navigateTo(page, 'topology');
    await delay(200);
    await setRoadmap(page, true);

    await navigateTo(page, 'topology');
    await waitForTestId(page, 'node-palette');
    await delay(200);
    const oltOn = await page.$('[data-testid="palette-olt"]');
    const ontOn = await page.$('[data-testid="palette-ont"]');
    expect(oltOn).not.toBeNull();
    expect(ontOn).not.toBeNull();

    await navigateTo(page, 'reports');
    await waitForTestId(page, 'reports-page');
    await delay(300);
    expect(await bodyTextContains(page, 'Coming Soon')).toBe(true);

    await navigateTo(page, 'tools');
    await waitForTestId(page, 'tools-page');
    await delay(300);
    expect(await bodyTextContains(page, 'Coming Soon')).toBe(true);
  }, 60000);
});
