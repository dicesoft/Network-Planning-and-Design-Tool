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
 * Helper: navigate to the Data Gen tab on the debug page and load a preset.
 */
async function loadPreset(page: Page, presetName: string): Promise<void> {
  await navigateTo(page, 'debug');
  await delay(500);
  await clickButtonByText(page, 'Data Gen');
  await delay(300);
  await clickButtonByText(page, presetName);
  await delay(200);
  await clickButtonByText(page, 'Load Preset');
  await delay(3000);
}

describe('Sprint 8 Features E2E Tests', () => {
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
  // Phase 1: Bug Fixes — Storage Backend Toggle
  // ==========================================================================

  describe('Storage Backend Toggle', () => {
    it('should display storage backend in status bar', async () => {
      await delay(1500);
      const statusText = await page.$eval(
        '[data-testid="status-bar"]',
        (el) => el.textContent || ''
      );
      // Should show either IndexedDB or localStorage
      expect(statusText.includes('IndexedDB') || statusText.includes('localStorage')).toBe(true);
    });

    it('should persist topology data across page reload', async () => {
      // Create a node so there is data to persist
      await page.keyboard.press('n');
      await delay(200);

      const pane = await page.$('.react-flow__pane');
      if (pane) {
        const box = await pane.boundingBox();
        if (box) {
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          await delay(500);

          const modal = await page.$('[data-testid="add-node-modal"]');
          if (modal) {
            const confirmBtn = await page.$('[data-testid="add-node-confirm"]');
            if (confirmBtn) {
              await confirmBtn.click();
              await delay(1000);
            }
          }
        }
      }

      // Wait for persistence to flush
      await delay(1500);

      // Reload the page
      await page.reload({ waitUntil: 'networkidle0' });
      await page.waitForSelector('[data-testid="canvas"]', { timeout: 10000 });
      await delay(1000);

      // Check status bar still shows at least 1 node
      const statusText = await page.$eval(
        '[data-testid="status-bar"]',
        (el) => el.textContent || ''
      );
      const nodesMatch = statusText.match(/Nodes:(\d+)/);
      expect(nodesMatch).not.toBeNull();
      expect(parseInt(nodesMatch![1], 10)).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================================================
  // Phase 3: Settings Overhaul — Full Panel with Inventory
  // ==========================================================================

  describe('Settings Panel with Inventory', () => {
    it('should open settings dialog with inventory tab', async () => {
      await page.click('[data-testid="settings-button"]');
      await waitForTestId(page, 'settings-dialog');
      await delay(300);

      // Click inventory tab
      const inventoryTab = await page.$('[data-testid="settings-tab-inventory"]');
      expect(inventoryTab).not.toBeNull();

      if (inventoryTab) {
        await inventoryTab.click();
        await delay(300);
      }

      await waitForTestId(page, 'inventory-section');
    });

    it('should display inventory sub-tabs for transceivers, cards, and subtypes', async () => {
      await page.click('[data-testid="settings-button"]');
      await waitForTestId(page, 'settings-dialog');
      await delay(300);

      const inventoryTab = await page.$('[data-testid="settings-tab-inventory"]');
      if (inventoryTab) {
        await inventoryTab.click();
        await delay(300);
      }

      const transceiversTab = await page.$('[data-testid="inventory-subtab-transceivers"]');
      const cardsTab = await page.$('[data-testid="inventory-subtab-cards"]');
      const subtypesTab = await page.$('[data-testid="inventory-subtab-subtypes"]');

      expect(transceiversTab).not.toBeNull();
      expect(cardsTab).not.toBeNull();
      expect(subtypesTab).not.toBeNull();
    });

    it('should display transceiver table with rows', async () => {
      await page.click('[data-testid="settings-button"]');
      await waitForTestId(page, 'settings-dialog');
      await delay(300);

      const inventoryTab = await page.$('[data-testid="settings-tab-inventory"]');
      if (inventoryTab) {
        await inventoryTab.click();
        await delay(300);
      }

      const table = await page.$('[data-testid="transceiver-table"]');
      expect(table).not.toBeNull();

      // Should have at least one transceiver row (defaults from library)
      const rows = await page.$$('[data-testid="transceiver-table"] tbody tr');
      expect(rows.length).toBeGreaterThan(0);
    });

    it('should switch between inventory sub-tabs', async () => {
      await page.click('[data-testid="settings-button"]');
      await waitForTestId(page, 'settings-dialog');
      await delay(300);

      const inventoryTab = await page.$('[data-testid="settings-tab-inventory"]');
      if (inventoryTab) {
        await inventoryTab.click();
        await delay(300);
      }

      // Click cards sub-tab
      const cardsTab = await page.$('[data-testid="inventory-subtab-cards"]');
      if (cardsTab) {
        await cardsTab.click();
        await delay(300);
      }

      const cardTable = await page.$('[data-testid="card-table"]');
      expect(cardTable).not.toBeNull();

      // Click subtypes sub-tab
      const subtypesTab = await page.$('[data-testid="inventory-subtab-subtypes"]');
      if (subtypesTab) {
        await subtypesTab.click();
        await delay(300);
      }

      const subtypeTable = await page.$('[data-testid="subtype-table"]');
      expect(subtypeTable).not.toBeNull();
    });

    it('should have import and export buttons in inventory section', async () => {
      await page.click('[data-testid="settings-button"]');
      await waitForTestId(page, 'settings-dialog');
      await delay(300);

      const inventoryTab = await page.$('[data-testid="settings-tab-inventory"]');
      if (inventoryTab) {
        await inventoryTab.click();
        await delay(300);
      }

      const importBtn = await page.$('[data-testid="inventory-import-btn"]');
      const exportBtn = await page.$('[data-testid="inventory-export-btn"]');

      expect(importBtn).not.toBeNull();
      expect(exportBtn).not.toBeNull();
    });

    it('should have optical settings tab', async () => {
      await page.click('[data-testid="settings-button"]');
      await waitForTestId(page, 'settings-dialog');
      await delay(300);

      const opticalTab = await page.$('[data-testid="settings-tab-optical"]');
      expect(opticalTab).not.toBeNull();

      if (opticalTab) {
        await opticalTab.click();
        await delay(300);
      }

      const dialogText = await page.$eval(
        '[data-testid="settings-dialog"]',
        (el) => el.textContent || ''
      );
      expect(
        dialogText.includes('Optical') ||
        dialogText.includes('Launch Power') ||
        dialogText.includes('OSNR')
      ).toBe(true);
    });
  });

  // ==========================================================================
  // Phase 4: NCE Import Wizard
  // ==========================================================================

  describe('NCE Import Wizard', () => {
    it('should have NCE import card on Tools page', async () => {
      await navigateTo(page, 'tools');
      await waitForTestId(page, 'tools-page');
      await delay(300);

      const nceCard = await page.$('[data-testid="tool-card-huawei-nce"]');
      expect(nceCard).not.toBeNull();
    });

    it('should open import wizard dialog when NCE card is clicked', async () => {
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
      expect(wizardText).toContain('Upload');
    });

    it('should display file drop zones for nodes and edges', async () => {
      await navigateTo(page, 'tools');
      await waitForTestId(page, 'tools-page');
      await delay(300);

      await page.click('[data-testid="tool-card-huawei-nce"]');
      await delay(500);

      await waitForTestId(page, 'import-wizard');

      const nodesDropzone = await page.$('[data-testid="import-nodes-dropzone"]');
      const edgesDropzone = await page.$('[data-testid="import-edges-dropzone"]');

      expect(nodesDropzone).not.toBeNull();
      expect(edgesDropzone).not.toBeNull();
    });

    it('should display template download buttons', async () => {
      await navigateTo(page, 'tools');
      await waitForTestId(page, 'tools-page');
      await delay(300);

      await page.click('[data-testid="tool-card-huawei-nce"]');
      await delay(500);

      await waitForTestId(page, 'import-wizard');

      const nodesTemplate = await page.$('[data-testid="download-nodes-template"]');
      const edgesTemplate = await page.$('[data-testid="download-edges-template"]');
      const servicesTemplate = await page.$('[data-testid="download-services-template"]');

      expect(nodesTemplate).not.toBeNull();
      expect(edgesTemplate).not.toBeNull();
      expect(servicesTemplate).not.toBeNull();
    });

    it('should show step indicators with all 5 steps', async () => {
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

      expect(wizardText).toContain('Upload');
      expect(wizardText).toContain('Validate');
      expect(wizardText).toContain('Preview');
      expect(wizardText).toContain('Mapping');
      expect(wizardText).toContain('Import');
    });

    it('should close wizard when Cancel is clicked', async () => {
      await navigateTo(page, 'tools');
      await waitForTestId(page, 'tools-page');
      await delay(300);

      await page.click('[data-testid="tool-card-huawei-nce"]');
      await delay(500);

      await waitForTestId(page, 'import-wizard');

      // Click Cancel button
      await clickButtonByText(page, 'Cancel');
      await delay(500);

      const wizard = await page.$('[data-testid="import-wizard"]');
      expect(wizard).toBeNull();
    });
  });

  // ==========================================================================
  // Phase 5: Forecast Page
  // ==========================================================================

  describe('Forecast Page', () => {
    it('should navigate to forecast page via header nav', async () => {
      await navigateTo(page, 'forecast');
      await delay(500);

      await waitForTestId(page, 'forecast-page');
    });

    it('should display forecast configuration panel', async () => {
      await navigateTo(page, 'forecast');
      await delay(500);

      await waitForTestId(page, 'forecast-config');
    });

    it('should show three forecast type options', async () => {
      await navigateTo(page, 'forecast');
      await delay(500);

      const serviceType = await page.$('[data-testid="forecast-type-service"]');
      const nodeType = await page.$('[data-testid="forecast-type-node"]');
      const lambdaType = await page.$('[data-testid="forecast-type-lambda"]');

      expect(serviceType).not.toBeNull();
      expect(nodeType).not.toBeNull();
      expect(lambdaType).not.toBeNull();
    });

    it('should display method select and interval select', async () => {
      await navigateTo(page, 'forecast');
      await delay(500);

      const methodSelect = await page.$('[data-testid="forecast-method-select"]');
      const intervalSelect = await page.$('[data-testid="forecast-interval-select"]');

      expect(methodSelect).not.toBeNull();
      expect(intervalSelect).not.toBeNull();
    });

    it('should have start and end date inputs', async () => {
      await navigateTo(page, 'forecast');
      await delay(500);

      const startDate = await page.$('[data-testid="forecast-start-date"]');
      const endDate = await page.$('[data-testid="forecast-end-date"]');

      expect(startDate).not.toBeNull();
      expect(endDate).not.toBeNull();
    });

    it('should have Run Forecast button', async () => {
      await navigateTo(page, 'forecast');
      await delay(500);

      const runBtn = await page.$('[data-testid="forecast-run-btn"]');
      expect(runBtn).not.toBeNull();

      const btnText = await runBtn!.evaluate((el) => el.textContent || '');
      expect(btnText).toContain('Run Forecast');
    });

    it('should show empty state before running forecast', async () => {
      await navigateTo(page, 'forecast');
      await delay(500);

      const pageText = await page.evaluate(() => document.body.textContent || '');
      expect(pageText).toContain('No Forecast Generated');
    });

    it('should switch forecast types by clicking type cards', async () => {
      await navigateTo(page, 'forecast');
      await delay(500);

      // Click Node Capacity type
      const nodeType = await page.$('[data-testid="forecast-type-node"]');
      if (nodeType) {
        await nodeType.click();
        await delay(300);
      }

      // Click Lambda type
      const lambdaType = await page.$('[data-testid="forecast-type-lambda"]');
      if (lambdaType) {
        await lambdaType.click();
        await delay(300);
      }

      // Click back to Service type
      const serviceType = await page.$('[data-testid="forecast-type-service"]');
      if (serviceType) {
        await serviceType.click();
        await delay(300);
      }

      // Should still show the run button (form is still valid)
      const runBtn = await page.$('[data-testid="forecast-run-btn"]');
      expect(runBtn).not.toBeNull();
    });

    it('should run forecast and display results with loaded topology', async () => {
      // Load a topology first
      await loadPreset(page, 'Metro Ring');

      // Navigate to forecast page
      await navigateTo(page, 'forecast');
      await delay(500);

      await waitForTestId(page, 'forecast-config');

      // Click Run Forecast
      const runBtn = await page.$('[data-testid="forecast-run-btn"]');
      expect(runBtn).not.toBeNull();
      await runBtn!.click();
      await delay(1000);

      // Should show results (empty state text should be gone)
      const pageText = await page.evaluate(() => document.body.textContent || '');
      expect(pageText).not.toContain('No Forecast Generated');

      // Should show service forecast title or results
      expect(
        pageText.includes('Service Growth Forecast') ||
        pageText.includes('Current Services') ||
        pageText.includes('Projected')
      ).toBe(true);
    });
  });

  // ==========================================================================
  // Phase 2: Amplifier Decision Panel (OsnrDecisionPanel)
  // ==========================================================================

  describe('Amplifier Decision UI', () => {
    it('should have Service Wizard accessible from services page', async () => {
      await navigateTo(page, 'services');
      await waitForTestId(page, 'services-page');
      await delay(300);

      const pageText = await page.evaluate(() => document.body.textContent || '');
      expect(pageText).toContain('Service Wizard');
    });
  });

  // ==========================================================================
  // What-If Path Selection
  // ==========================================================================

  describe('What-If Path Selection', () => {
    it('should navigate to capacity page What-If section', async () => {
      await navigateTo(page, 'capacity');
      await waitForTestId(page, 'capacity-page');
      await delay(300);

      const pageText = await page.evaluate(() => document.body.textContent || '');
      expect(pageText).toContain('What-If');
    });

    it('should show What-If controls with loaded topology', async () => {
      // Load metro ring preset
      await loadPreset(page, 'Metro Ring');

      // Navigate to capacity page
      await navigateTo(page, 'capacity');
      await waitForTestId(page, 'capacity-page');
      await delay(300);

      // Click What-If tab
      await clickButtonByText(page, 'What-If');
      await delay(500);

      const bodyText = await page.evaluate(() => document.body.textContent || '');
      expect(bodyText).toContain('What-If');
    });
  });

  // ==========================================================================
  // Console Error Check
  // ==========================================================================

  describe('No Console Errors on Key Pages', () => {
    it('should not have critical errors on topology page', async () => {
      await delay(1000);
      const errors = consoleLogs.getLogs().filter(
        (log) => log.startsWith('[error]') && !log.includes('favicon')
      );
      expect(errors.length).toBe(0);
    });

    it('should not have critical errors on forecast page', async () => {
      await navigateTo(page, 'forecast');
      await delay(1000);

      const errors = consoleLogs.getLogs().filter(
        (log) => log.startsWith('[error]') && !log.includes('favicon')
      );
      expect(errors.length).toBe(0);
    });

    it('should not have critical errors when opening settings', async () => {
      await page.click('[data-testid="settings-button"]');
      await waitForTestId(page, 'settings-dialog');
      await delay(500);

      // Click through all tabs including new ones
      const tabs = ['general', 'canvas', 'network', 'optical', 'simulation', 'advanced', 'inventory'];
      for (const tab of tabs) {
        const tabEl = await page.$(`[data-testid="settings-tab-${tab}"]`);
        if (tabEl) {
          await tabEl.click();
          await delay(300);
        }
      }

      const errors = consoleLogs.getLogs().filter(
        (log) => log.startsWith('[error]') && !log.includes('favicon')
      );
      expect(errors.length).toBe(0);
    });
  });
});
