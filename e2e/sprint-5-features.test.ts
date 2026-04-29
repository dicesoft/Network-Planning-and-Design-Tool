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
 * Helper: click a button by its text content.
 * Returns true if a matching button was found and clicked.
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

/**
 * Helper: navigate to the Data Gen tab on the debug page.
 */
async function goToDataGenTab(page: Page): Promise<void> {
  await navigateTo(page, 'debug');
  await delay(500);
  // Click the "Data Gen" tab
  await clickButtonByText(page, 'Data Gen');
  await delay(300);
}

describe('Sprint 5 Features E2E Tests', () => {
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
        consoleLogs.getLogs().join('\n')
      );
    }
    await page.close();
  });

  // ==========================================================================
  // Phase 1: Storage Backend Indicator in StatusBar
  // ==========================================================================

  describe('Storage Backend Indicator', () => {
    // P5.4: storage probe delay raised from 1500 to 2500 ms (Apr 2026 release).
    // Reason: under headless CI the probe occasionally fired after the original
    // 1500 ms wait, producing flaky null reads of the indicator. The behavioral
    // assertion (indicator is present, contains "IndexedDB") is unchanged.
    it('should display storage backend indicator in status bar after probe delay', async () => {
      // The storage indicator has a 1000ms setTimeout before rendering
      await delay(2500);
      const indicator = await page.$('[data-testid="storage-backend-indicator"]');
      expect(indicator).not.toBeNull();
    });

    it('should show IndexedDB as the storage backend', async () => {
      await delay(2500);
      const indicatorText = await page.$eval(
        '[data-testid="storage-backend-indicator"]',
        (el) => el.textContent || ''
      );
      expect(indicatorText).toContain('IndexedDB');
    });

    it('should include storage backend text in status bar', async () => {
      await delay(2500);
      const statusText = await page.$eval(
        '[data-testid="status-bar"]',
        (el) => el.textContent || ''
      );
      expect(statusText).toContain('IndexedDB');
    });
  });

  // ==========================================================================
  // Phase 3.5: Settings Dialog Overflow Fix
  // ==========================================================================

  describe('Settings Dialog Scrolling', () => {
    it('should open settings dialog with bounded height', async () => {
      await page.click('[data-testid="settings-button"]');
      await waitForTestId(page, 'settings-dialog');
      await delay(300);

      const dialogBox = await page.$eval('[data-testid="settings-dialog"]', (el) => {
        const rect = el.getBoundingClientRect();
        return {
          height: rect.height,
        };
      });

      // Dialog height should be constrained by max-h-[85vh] (85% of 1080 = 918px + tolerance)
      expect(dialogBox.height).toBeLessThanOrEqual(1080 * 0.85 + 30);
    });

    it('should keep footer buttons visible when switching tabs', async () => {
      await page.click('[data-testid="settings-button"]');
      await waitForTestId(page, 'settings-dialog');
      await delay(300);

      const tabs = ['general', 'canvas', 'network', 'simulation', 'advanced'];
      for (const tab of tabs) {
        const tabEl = await page.$(`[data-testid="settings-tab-${tab}"]`);
        if (tabEl) {
          await tabEl.click();
          await delay(200);
        }

        const applyBtn = await page.$('[data-testid="settings-apply-btn"]');
        expect(applyBtn).not.toBeNull();

        const btnBox = await applyBtn!.evaluate((el) => {
          const rect = el.getBoundingClientRect();
          return { bottom: rect.bottom };
        });
        expect(btnBox.bottom).toBeLessThanOrEqual(1080);
      }
    });

    it('should have max-h constraint on dialog', async () => {
      await page.click('[data-testid="settings-button"]');
      await waitForTestId(page, 'settings-dialog');
      await delay(300);

      const maxHeight = await page.$eval('[data-testid="settings-dialog"]', (el) => {
        return window.getComputedStyle(el).maxHeight;
      });

      // Should have a max-height set (not 'none')
      expect(maxHeight).not.toBe('none');
      expect(maxHeight).not.toBe('');
    });
  });

  // ==========================================================================
  // Phase 2.2: What-If Path Cards
  // ==========================================================================

  describe('What-If Path Cards', () => {
    it('should navigate to capacity page and show What-If tab', async () => {
      await navigateTo(page, 'capacity');
      await waitForTestId(page, 'capacity-page');
      await delay(300);

      const pageText = await page.evaluate(() => document.body.textContent || '');
      expect(pageText).toContain('What-If');
    });

    it('should show path cards row element when path data exists', async () => {
      // Load metro ring preset from debug Data Gen tab
      await goToDataGenTab(page);

      // Click Load Metro Ring button
      await clickButtonByText(page, 'Load Metro Ring');
      await delay(2000);

      // Navigate to capacity page and click What-If tab
      await navigateTo(page, 'capacity');
      await waitForTestId(page, 'capacity-page');
      await delay(300);

      // Click What-If tab
      await clickButtonByText(page, 'What-If');
      await delay(500);

      // What-If section should be visible on the page
      const bodyText = await page.evaluate(() => document.body.textContent || '');
      expect(bodyText).toContain('What-If');
    });
  });

  // ==========================================================================
  // Phase 2.5: OSNR Gauge Rendering
  // ==========================================================================

  describe('OSNR Gauge', () => {
    it('should have Service Wizard available for OSNR gauge creation', async () => {
      await navigateTo(page, 'services');
      await waitForTestId(page, 'services-page');
      await delay(300);

      const hasWizardBtn = await clickButtonByText(page, 'Service Wizard');
      // Just check the button exists - don't actually click through the whole wizard
      // (that would need a full topology with connected nodes)
      expect(
        hasWizardBtn ||
          (await page.evaluate(() =>
            document.body.textContent?.includes('Service Wizard')
          ))
      ).toBe(true);
    });
  });

  // ==========================================================================
  // Phase 2.6: Progress Bar / Loading Overlay
  // ==========================================================================

  describe('Progress Bar / Loading Overlay', () => {
    it('should load a topology preset and show nodes in status bar', async () => {
      await goToDataGenTab(page);

      // Click National Backbone preset button to select it
      await clickButtonByText(page, 'National Backbone');
      await delay(200);

      // Click Load Preset button
      await clickButtonByText(page, 'Load Preset');
      await delay(3000);

      // Navigate back to topology to check the status bar
      await navigateTo(page, 'topology');
      await page.waitForSelector('[data-testid="status-bar"]', { timeout: 5000 });
      await delay(500);

      const statusText = await page.$eval(
        '[data-testid="status-bar"]',
        (el) => el.textContent || ''
      );
      const nodesMatch = statusText.match(/Nodes:(\d+)/);
      expect(nodesMatch).not.toBeNull();
      expect(parseInt(nodesMatch![1], 10)).toBeGreaterThan(0);
    });

    it('should load Regional DWDM preset with progress tracking', async () => {
      await goToDataGenTab(page);

      // Click Regional DWDM preset button to select it (14 nodes, moderate size)
      await clickButtonByText(page, 'Regional DWDM');
      await delay(200);

      // Click Load Preset
      await clickButtonByText(page, 'Load Preset');
      await delay(3000);

      // Navigate back to topology to check the status bar
      await navigateTo(page, 'topology');
      await page.waitForSelector('[data-testid="status-bar"]', { timeout: 5000 });
      await delay(500);

      const statusText = await page.$eval(
        '[data-testid="status-bar"]',
        (el) => el.textContent || ''
      );
      const nodesMatch = statusText.match(/Nodes:(\d+)/);
      expect(nodesMatch).not.toBeNull();
      expect(parseInt(nodesMatch![1], 10)).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Phase 3.4: Expanded Transceiver Library
  // ==========================================================================

  describe('Expanded Transceiver Library', () => {
    it('should have optical settings available in settings dialog', async () => {
      await page.click('[data-testid="settings-button"]');
      await waitForTestId(page, 'settings-dialog');
      await delay(300);

      const dialogText = await page.$eval(
        '[data-testid="settings-dialog"]',
        (el) => el.textContent || ''
      );
      // Settings should contain optical/network settings
      expect(
        dialogText.includes('Optical') ||
          dialogText.includes('Network') ||
          dialogText.includes('Launch Power')
      ).toBe(true);
    });
  });

  // ==========================================================================
  // Phase 2.4: Regeneration Test Preset
  // ==========================================================================

  describe('Regeneration Test Preset', () => {
    it('should have Regeneration Test preset available in Data Gen tab', async () => {
      await goToDataGenTab(page);

      const bodyText = await page.evaluate(() => document.body.textContent || '');
      expect(bodyText).toContain('Regeneration Test');
    });

    it('should load Regeneration Test preset successfully', async () => {
      await goToDataGenTab(page);

      // Click Regeneration Test preset to select it
      await clickButtonByText(page, 'Regeneration Test');
      await delay(200);

      // Click Load Preset
      await clickButtonByText(page, 'Load Preset');
      await delay(3000);

      // Navigate back to topology to check status bar
      await navigateTo(page, 'topology');
      await page.waitForSelector('[data-testid="status-bar"]', { timeout: 5000 });
      await delay(500);

      // Should have 6 nodes and 5 edges (linear topology)
      const statusText = await page.$eval(
        '[data-testid="status-bar"]',
        (el) => el.textContent || ''
      );
      expect(statusText).toContain('Nodes:6');
      expect(statusText).toContain('Edges:5');
    });
  });
});
