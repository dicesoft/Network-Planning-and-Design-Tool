/**
 * E2E Tests for Comprehensive Bugs & Features Sprint
 *
 * Tests new features implemented across Phases 1-9:
 * - Reset Network (Phase 4.2)
 * - Node Display Modes (Phase 3.4)
 * - Tool Palette in Toolbar (Phase 2.1)
 * - Service Export (Phase 7.4)
 * - Settings Enforcement (Phase 1.3)
 */
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
  getNodeCount,
  createTestNode,
  clearTopologyState,
} from './helpers';

describe('Sprint Features E2E Tests', () => {
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

  describe('Reset Network (Phase 4.2)', () => {
    it('should show reset button in header', async () => {
      const resetBtn = await page.$('[data-testid="reset-network-button"]');
      expect(resetBtn).not.toBeNull();
    });

    it('should disable reset button when network is empty', async () => {
      const isDisabled = await page.$eval(
        '[data-testid="reset-network-button"]',
        (el) => (el as HTMLButtonElement).disabled
      );
      expect(isDisabled).toBe(true);
    });

    it('should enable reset button after adding nodes', async () => {
      await createTestNode(page, 'router');
      const nodes = await getNodeCount(page);
      expect(nodes).toBeGreaterThan(0);

      const isDisabled = await page.$eval(
        '[data-testid="reset-network-button"]',
        (el) => (el as HTMLButtonElement).disabled
      );
      expect(isDisabled).toBe(false);
    });

    it('should show confirmation dialog on reset click', async () => {
      // Add a node so reset is enabled
      await createTestNode(page, 'router');
      await delay(300);

      // Click reset button
      const resetBtn = await page.$('[data-testid="reset-network-button"]');
      await resetBtn!.click();
      await delay(500);

      // Confirmation dialog should appear
      const dialog = await page.$('[role="dialog"]');
      expect(dialog).not.toBeNull();

      // Dialog should mention "Reset Network"
      const dialogText = await dialog!.evaluate((el) => el.textContent || '');
      expect(dialogText).toContain('Reset Network');
    });

    it('should clear topology when reset is confirmed', async () => {
      // Add nodes
      await createTestNode(page, 'router');
      await createTestNode(page, 'switch');
      await delay(300);
      const beforeReset = await getNodeCount(page);
      expect(beforeReset).toBeGreaterThan(0);

      // Click reset button
      const resetBtn = await page.$('[data-testid="reset-network-button"]');
      await resetBtn!.click();
      await delay(500);

      // Find and click the confirm button in dialog
      const dialog = await page.$('[role="dialog"]');
      expect(dialog).not.toBeNull();

      const buttons = await dialog!.$$('button');
      for (const btn of buttons) {
        const text = await btn.evaluate((el) => el.textContent);
        if (text?.includes('Reset Network')) {
          await btn.click();
          break;
        }
      }
      await delay(500);

      // Verify network is empty
      const afterReset = await getNodeCount(page);
      expect(afterReset).toBe(0);
    });
  });

  describe('Node Display Modes (Phase 3.4)', () => {
    it('should show node display mode button in toolbar', async () => {
      const displayBtn = await page.$('[data-testid="node-display-mode-button"]');
      expect(displayBtn).not.toBeNull();
    });

    it('should open display mode dropdown on click', async () => {
      const displayBtn = await page.$('[data-testid="node-display-mode-button"]');
      await displayBtn!.click();
      await delay(300);

      // Check dropdown menu items appear
      const expandedItem = await page.$('[data-testid="node-display-mode-expanded"]');
      const compactItem = await page.$('[data-testid="node-display-mode-compact"]');
      const iconOnlyItem = await page.$('[data-testid="node-display-mode-icon-only"]');

      expect(expandedItem).not.toBeNull();
      expect(compactItem).not.toBeNull();
      expect(iconOnlyItem).not.toBeNull();
    });

    it('should switch to compact mode', async () => {
      // Add a node first
      await createTestNode(page, 'router');
      await delay(300);

      // Open display mode dropdown
      const displayBtn = await page.$('[data-testid="node-display-mode-button"]');
      await displayBtn!.click();
      await delay(300);

      // Select compact mode
      const compactItem = await page.$('[data-testid="node-display-mode-compact"]');
      await compactItem!.click();
      await delay(500);

      // Re-open dropdown to verify compact is now checked
      await displayBtn!.click();
      await delay(300);

      // The compact item should have data-state="checked" (Radix UI checkbox item)
      const checkedState = await page.$eval(
        '[data-testid="node-display-mode-compact"]',
        (el) => el.getAttribute('data-state')
      );
      expect(checkedState).toBe('checked');
    });
  });

  describe('Tool Palette in Toolbar (Phase 2.1)', () => {
    it('should show tool buttons in toolbar', async () => {
      const toolsContainer = await page.$('[data-testid="toolbar-tools"]');
      expect(toolsContainer).not.toBeNull();
    });

    it('should have select, add, connect, and pan tool buttons', async () => {
      const selectBtn = await page.$('[data-testid="toolbar-tool-select"]');
      const addBtn = await page.$('[data-testid="toolbar-tool-add"]');
      const connectBtn = await page.$('[data-testid="toolbar-tool-connect"]');
      const panBtn = await page.$('[data-testid="toolbar-tool-pan"]');

      expect(selectBtn).not.toBeNull();
      expect(addBtn).not.toBeNull();
      expect(connectBtn).not.toBeNull();
      expect(panBtn).not.toBeNull();
    });

    it('should switch tool mode when clicking toolbar buttons', async () => {
      // Click add button
      const addBtn = await page.$('[data-testid="toolbar-tool-add"]');
      await addBtn!.click();
      await delay(300);

      // Status bar should show mode:add
      const statusText = await page.$eval('[data-testid="status-bar"]', (el) => el.textContent || '');
      expect(statusText).toContain('add');

      // Click select button to restore
      const selectBtn = await page.$('[data-testid="toolbar-tool-select"]');
      await selectBtn!.click();
      await delay(300);

      const statusAfter = await page.$eval('[data-testid="status-bar"]', (el) => el.textContent || '');
      expect(statusAfter).toContain('select');
    });
  });

  describe('Service Export (Phase 7.4)', () => {
    it('should show export button on Services page', async () => {
      await navigateTo(page, 'services');
      await waitForTestId(page, 'services-page');
      await delay(300);

      const exportBtn = await page.$('[data-testid="export-services-dropdown"]');
      expect(exportBtn).not.toBeNull();
    });

    it('should have export button text containing Export', async () => {
      await navigateTo(page, 'services');
      await waitForTestId(page, 'services-page');
      await delay(300);

      const btnText = await page.$eval('[data-testid="export-services-dropdown"]', (el) => el.textContent || '');
      expect(btnText).toContain('Export');
    });
  });

  describe('Settings Dialog (Phase 1.3)', () => {
    it('should open settings dialog', async () => {
      const settingsBtn = await page.$('[data-testid="settings-button"]');
      await settingsBtn!.click();
      await delay(500);

      const dialog = await page.$('[data-testid="settings-dialog"]');
      expect(dialog).not.toBeNull();
    });

    it('should show all settings tabs', async () => {
      const settingsBtn = await page.$('[data-testid="settings-button"]');
      await settingsBtn!.click();
      await delay(500);

      const generalTab = await page.$('[data-testid="settings-tab-general"]');
      const canvasTab = await page.$('[data-testid="settings-tab-canvas"]');
      const networkTab = await page.$('[data-testid="settings-tab-network"]');
      const simulationTab = await page.$('[data-testid="settings-tab-simulation"]');
      const advancedTab = await page.$('[data-testid="settings-tab-advanced"]');

      expect(generalTab).not.toBeNull();
      expect(canvasTab).not.toBeNull();
      expect(networkTab).not.toBeNull();
      expect(simulationTab).not.toBeNull();
      expect(advancedTab).not.toBeNull();
    });

    it('should switch between settings tabs', async () => {
      const settingsBtn = await page.$('[data-testid="settings-button"]');
      await settingsBtn!.click();
      await delay(500);

      // Click canvas tab
      const canvasTab = await page.$('[data-testid="settings-tab-canvas"]');
      await canvasTab!.click();
      await delay(300);

      // Canvas tab content should be visible (look for grid-related text)
      const dialogContent = await page.$eval('[data-testid="settings-dialog"]', (el) => el.textContent || '');
      expect(dialogContent).toContain('Grid');

      // Click simulation tab
      const simTab = await page.$('[data-testid="settings-tab-simulation"]');
      await simTab!.click();
      await delay(300);

      const simContent = await page.$eval('[data-testid="settings-dialog"]', (el) => el.textContent || '');
      expect(simContent).toContain('Simulation');
    });
  });
});
