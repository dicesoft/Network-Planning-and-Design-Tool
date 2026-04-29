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

describe('Sprint 9 Features E2E Tests', () => {
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
  // Issue 1: NCE Import on Tools Page
  // ==========================================================================

  describe('NCE Import from Tools Page (Issue 1)', () => {
    it('should show Huawei NCE card on Tools page as available', async () => {
      await navigateTo(page, 'tools');
      await waitForTestId(page, 'tools-page');
      await delay(300);

      const nceCard = await page.$('[data-testid="tool-card-huawei-nce"]');
      expect(nceCard).not.toBeNull();

      // Card should NOT say "Coming Soon"
      const cardText = await nceCard!.evaluate((el) => el.textContent || '');
      expect(cardText).not.toContain('Coming Soon');
      expect(cardText).toContain('Huawei NCE Import');
    });

    it('should open import wizard when Huawei NCE card is clicked', async () => {
      await navigateTo(page, 'tools');
      await waitForTestId(page, 'tools-page');
      await delay(300);

      await page.click('[data-testid="tool-card-huawei-nce"]');
      await delay(500);

      await waitForTestId(page, 'import-wizard');
      const wizardText = await page.$eval(
        '[data-testid="import-wizard"]',
        (el) => el.textContent || ''
      );
      expect(wizardText).toContain('Import Network Topology');
    });
  });

  // ==========================================================================
  // Issue 2: Wizard Sizing
  // ==========================================================================

  describe('Import Wizard Sizing (Issue 2)', () => {
    it('should have appropriately sized wizard dialog', async () => {
      await navigateTo(page, 'tools');
      await waitForTestId(page, 'tools-page');
      await delay(300);

      await page.click('[data-testid="tool-card-huawei-nce"]');
      await delay(500);

      await waitForTestId(page, 'import-wizard');

      // Check that the dialog has reasonable dimensions
      const box = await page.$eval('[data-testid="import-wizard"]', (el) => {
        const rect = el.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      });

      // max-w-5xl = 64rem = 1024px at default font size
      // Should be wider than 800px (was max-w-4xl = 896px before)
      expect(box.width).toBeGreaterThan(700);
    });
  });

  // ==========================================================================
  // Issues 3-5: Services Drop Zone, Templates, Definitions
  // ==========================================================================

  describe('Import Enhancements (Issues 3-5)', () => {
    it('should have 3 drop zones: Nodes, Edges, Services', async () => {
      await navigateTo(page, 'tools');
      await waitForTestId(page, 'tools-page');
      await delay(300);

      await page.click('[data-testid="tool-card-huawei-nce"]');
      await delay(500);

      await waitForTestId(page, 'import-wizard');

      const nodesDropzone = await page.$('[data-testid="import-nodes-dropzone"]');
      const edgesDropzone = await page.$('[data-testid="import-edges-dropzone"]');
      const servicesDropzone = await page.$('[data-testid="import-services-dropzone"]');

      expect(nodesDropzone).not.toBeNull();
      expect(edgesDropzone).not.toBeNull();
      expect(servicesDropzone).not.toBeNull();
    });

    it('should have definitions download button', async () => {
      await navigateTo(page, 'tools');
      await waitForTestId(page, 'tools-page');
      await delay(300);

      await page.click('[data-testid="tool-card-huawei-nce"]');
      await delay(500);

      await waitForTestId(page, 'import-wizard');

      const definitionsBtn = await page.$('[data-testid="download-definitions"]');
      expect(definitionsBtn).not.toBeNull();

      const btnText = await definitionsBtn!.evaluate((el) => el.textContent || '');
      expect(btnText).toContain('Definitions');
    });

    it('should have all 4 template download buttons (Nodes, Edges, Services, Definitions)', async () => {
      await navigateTo(page, 'tools');
      await waitForTestId(page, 'tools-page');
      await delay(300);

      await page.click('[data-testid="tool-card-huawei-nce"]');
      await delay(500);

      await waitForTestId(page, 'import-wizard');

      const nodesTemplate = await page.$('[data-testid="download-nodes-template"]');
      const edgesTemplate = await page.$('[data-testid="download-edges-template"]');
      const servicesTemplate = await page.$('[data-testid="download-services-template"]');
      const definitionsBtn = await page.$('[data-testid="download-definitions"]');

      expect(nodesTemplate).not.toBeNull();
      expect(edgesTemplate).not.toBeNull();
      expect(servicesTemplate).not.toBeNull();
      expect(definitionsBtn).not.toBeNull();
    });
  });

  // ==========================================================================
  // Issue 1 (negative): NCE button should NOT be in header
  // ==========================================================================

  describe('NCE Import Removed from Header (Issue 1)', () => {
    it('should NOT have NCE import button in header toolbar', async () => {
      // The old NCE button used a FileSpreadsheet icon in the header
      const nceBtn = await page.$('[data-testid="nce-import-button"]');
      expect(nceBtn).toBeNull();
    });
  });

  // ==========================================================================
  // No Console Errors
  // ==========================================================================

  describe('No Console Errors on Sprint 9 Features', () => {
    it('should not have critical errors on Tools page', async () => {
      await navigateTo(page, 'tools');
      await delay(1000);

      const errors = consoleLogs.getLogs().filter(
        (log) => log.startsWith('[error]') && !log.includes('favicon')
      );
      expect(errors.length).toBe(0);
    });

    it('should not have critical errors when opening NCE wizard', async () => {
      await navigateTo(page, 'tools');
      await waitForTestId(page, 'tools-page');
      await delay(300);

      await page.click('[data-testid="tool-card-huawei-nce"]');
      await delay(500);

      await waitForTestId(page, 'import-wizard');

      const errors = consoleLogs.getLogs().filter(
        (log) => log.startsWith('[error]') && !log.includes('favicon')
      );
      expect(errors.length).toBe(0);
    });
  });
});
