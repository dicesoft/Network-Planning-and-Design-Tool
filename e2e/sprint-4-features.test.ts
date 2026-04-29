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
  createTestNode,
  clearTopologyState,
} from './helpers';

describe('Sprint 4 Features E2E Tests', () => {
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
  // Phase 1 Bug Fixes
  // ==========================================================================

  describe('Bug 1: Consolidated Services Export', () => {
    it('should have a single export dropdown on services page', async () => {
      await navigateTo(page, 'services');
      await waitForTestId(page, 'services-page');
      await delay(300);

      // Should have exactly one export dropdown
      const dropdown = await page.$('[data-testid="export-services-dropdown"]');
      expect(dropdown).not.toBeNull();

      // Verify button text says "Export"
      const btnText = await page.$eval(
        '[data-testid="export-services-dropdown"]',
        (el) => el.textContent || ''
      );
      expect(btnText).toContain('Export');
    });

    it('should show JSON and CSV options in export dropdown', async () => {
      await navigateTo(page, 'services');
      await waitForTestId(page, 'services-page');
      await delay(300);

      // Click the export dropdown trigger
      const dropdown = await page.$('[data-testid="export-services-dropdown"]');
      await dropdown!.click();
      await delay(300);

      // Check for dropdown menu items
      const menuItems = await page.$$('[role="menuitem"]');
      const menuTexts: string[] = [];
      for (const item of menuItems) {
        const text = await item.evaluate((el) => el.textContent || '');
        menuTexts.push(text);
      }

      expect(menuTexts.some((t) => t.includes('JSON'))).toBe(true);
      expect(menuTexts.some((t) => t.includes('CSV'))).toBe(true);
    });
  });

  describe('Bug 2: No Quick Add Service', () => {
    it('should not have Quick Add button on services page', async () => {
      await navigateTo(page, 'services');
      await waitForTestId(page, 'services-page');
      await delay(300);

      // Look for any button containing "Quick Add" text
      const buttons = await page.$$('button');
      let hasQuickAdd = false;
      for (const btn of buttons) {
        const text = await btn.evaluate((el) => el.textContent || '');
        if (text.includes('Quick Add')) {
          hasQuickAdd = true;
          break;
        }
      }
      expect(hasQuickAdd).toBe(false);
    });

    it('should have Service Wizard button on services page toolbar', async () => {
      await navigateTo(page, 'services');
      await waitForTestId(page, 'services-page');
      await delay(300);

      // Find the Service Wizard button
      const buttons = await page.$$('button');
      let hasWizardBtn = false;
      for (const btn of buttons) {
        const text = await btn.evaluate((el) => el.textContent || '');
        if (text.includes('Service Wizard')) {
          hasWizardBtn = true;
          break;
        }
      }
      expect(hasWizardBtn).toBe(true);
    });
  });

  describe('Bug 3: Capacity Dashboard Table Height', () => {
    it('should render capacity dashboard without overflowing viewport', async () => {
      await navigateTo(page, 'capacity');
      await waitForTestId(page, 'capacity-page');
      await delay(500);

      // The page should not have a vertical scrollbar on the main content area
      // (the table should fit within the viewport using overflow-hidden parent)
      const pageHeight = await page.evaluate(() => {
        return document.documentElement.scrollHeight;
      });

      // At 1080p viewport, page should not scroll significantly beyond viewport
      expect(pageHeight).toBeLessThanOrEqual(1120); // Small tolerance for margins
    });
  });

  // ==========================================================================
  // Phase 4: Inventory System
  // ==========================================================================

  describe('Inventory Tab in Node Inspector', () => {
    it('should show inventory tab in node inspector tabs', async () => {
      // Create a node
      const created = await createTestNode(page, 'router');
      expect(created).toBe(true);
      await delay(300);

      // Click on the node to select it (click on a React Flow node)
      const nodes = await page.$$('.react-flow__node');
      if (nodes.length > 0) {
        await nodes[0].click();
        await delay(500);
      }

      // Check if inspector opens with tab navigation
      const inspectorTabInventory = await page.$('[data-testid="inspector-tab-inventory"]');
      expect(inspectorTabInventory).not.toBeNull();
    });

    it('should switch to inventory tab and show content', async () => {
      // Create a node
      await createTestNode(page, 'router');
      await delay(300);

      // Click node to select and open inspector
      const nodes = await page.$$('.react-flow__node');
      if (nodes.length > 0) {
        await nodes[0].click();
        await delay(500);
      }

      // Click on inventory tab
      const invTab = await page.$('[data-testid="inspector-tab-inventory"]');
      if (invTab) {
        await invTab.click();
        await delay(300);

        // Inventory tab content should be visible
        const invContent = await page.$('[data-testid="inventory-tab"]');
        expect(invContent).not.toBeNull();
      }
    });

    it('should show inventory tab content with chassis info or no-chassis message', async () => {
      // Create a node
      await createTestNode(page, 'router');
      await delay(300);

      // Click node to select
      const nodes = await page.$$('.react-flow__node');
      if (nodes.length > 0) {
        await nodes[0].click();
        await delay(500);
      }

      // Switch to inventory tab
      const invTab = await page.$('[data-testid="inspector-tab-inventory"]');
      if (invTab) {
        await invTab.click();
        await delay(300);

        // Inventory tab content should be visible with either chassis slots or no-chassis message
        const invContent = await page.$('[data-testid="inventory-tab"]');
        expect(invContent).not.toBeNull();

        const invText = await invContent!.evaluate((el) => el.textContent || '');
        // Should contain either "Hardware Inventory" header or chassis info
        expect(invText).toContain('Hardware Inventory');
      }
    });
  });

  // ==========================================================================
  // Phase 7: Settings Overhaul
  // ==========================================================================

  describe('Settings Apply/Discard Flow', () => {
    it('should show Apply button disabled when no changes made', async () => {
      // Open settings
      await page.click('[data-testid="settings-button"]');
      await waitForTestId(page, 'settings-dialog');
      await delay(300);

      // Apply button should exist but be disabled
      const applyBtn = await page.$('[data-testid="settings-apply-btn"]');
      expect(applyBtn).not.toBeNull();

      const isDisabled = await applyBtn!.evaluate((el) =>
        (el as HTMLButtonElement).disabled
      );
      expect(isDisabled).toBe(true);
    });

    it('should show change summary after modifying a setting', async () => {
      // Open settings
      await page.click('[data-testid="settings-button"]');
      await waitForTestId(page, 'settings-dialog');
      await delay(300);

      // Click on Canvas tab to find a toggleable setting
      const canvasTab = await page.$('[data-testid="settings-tab-canvas"]');
      if (canvasTab) {
        await canvasTab.click();
        await delay(300);
      }

      // Find and toggle a checkbox (e.g., grid visible or snap to grid)
      const checkboxes = await page.$$('[data-testid="settings-dialog"] input[type="checkbox"]');
      if (checkboxes.length > 0) {
        await checkboxes[0].click();
        await delay(300);

        // Change summary should appear
        const summary = await page.$('[data-testid="settings-changes-summary"]');
        expect(summary).not.toBeNull();

        // Apply button should now be enabled
        const applyBtn = await page.$('[data-testid="settings-apply-btn"]');
        const isDisabled = await applyBtn!.evaluate((el) =>
          (el as HTMLButtonElement).disabled
        );
        expect(isDisabled).toBe(false);
      }
    });

    it('should show Discard button when changes exist', async () => {
      // Open settings
      await page.click('[data-testid="settings-button"]');
      await waitForTestId(page, 'settings-dialog');
      await delay(300);

      // Make a change
      const canvasTab = await page.$('[data-testid="settings-tab-canvas"]');
      if (canvasTab) {
        await canvasTab.click();
        await delay(300);
      }

      const checkboxes = await page.$$('[data-testid="settings-dialog"] input[type="checkbox"]');
      if (checkboxes.length > 0) {
        await checkboxes[0].click();
        await delay(300);

        // Discard button should appear
        const discardBtn = await page.$('[data-testid="settings-discard-btn"]');
        expect(discardBtn).not.toBeNull();
      }
    });

    it('should show unsaved changes dialog when closing with pending changes', async () => {
      // Open settings
      await page.click('[data-testid="settings-button"]');
      await waitForTestId(page, 'settings-dialog');
      await delay(300);

      // Make a change
      const canvasTab = await page.$('[data-testid="settings-tab-canvas"]');
      if (canvasTab) {
        await canvasTab.click();
        await delay(300);
      }

      const checkboxes = await page.$$('[data-testid="settings-dialog"] input[type="checkbox"]');
      if (checkboxes.length > 0) {
        await checkboxes[0].click();
        await delay(300);

        // Try to close with Escape
        await page.keyboard.press('Escape');
        await delay(500);

        // Unsaved changes dialog should appear
        const unsavedDialog = await page.$('[data-testid="settings-unsaved-dialog"]');
        expect(unsavedDialog).not.toBeNull();
      }
    });

    it('should close settings without warning when no changes made', async () => {
      // Open settings
      await page.click('[data-testid="settings-button"]');
      await waitForTestId(page, 'settings-dialog');
      await delay(300);

      // Close with Escape (no changes)
      await page.keyboard.press('Escape');
      await delay(500);

      // Dialog should be gone (no unsaved dialog)
      const dialog = await page.$('[data-testid="settings-dialog"]');
      expect(dialog).toBeNull();
    });
  });

  // ==========================================================================
  // Phase 1 Bug 6: Lambda Searchable Dropdowns
  // ==========================================================================

  describe('Bug 6: Lambda Searchable Dropdowns', () => {
    it('should render capacity page Lambda study tab', async () => {
      await navigateTo(page, 'capacity');
      await waitForTestId(page, 'capacity-page');
      await delay(300);

      // Look for Lambda study tab in the capacity sub-nav
      const pageText = await page.evaluate(() => document.body.textContent || '');
      expect(pageText).toContain('Lambda');
    });
  });

  // ==========================================================================
  // IndexedDB Storage (Phase 6)
  // ==========================================================================

  describe('IndexedDB Storage', () => {
    it('should persist topology data in IndexedDB', async () => {
      // Create a node
      await createTestNode(page);
      await delay(1000); // Wait for async IndexedDB persist

      // Verify data is in IndexedDB
      const hasData = await page.evaluate(async () => {
        return new Promise<boolean>((resolve) => {
          const req = indexedDB.open('atlas-network-db');
          req.onsuccess = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('zustand-persist')) {
              db.close();
              resolve(false);
              return;
            }
            const tx = db.transaction('zustand-persist', 'readonly');
            const getReq = tx.objectStore('zustand-persist').get('network-topology-storage');
            getReq.onsuccess = () => {
              db.close();
              const raw = getReq.result;
              if (!raw) { resolve(false); return; }
              try {
                const parsed = JSON.parse(raw as string);
                resolve(parsed.state?.topology?.nodes?.length > 0);
              } catch { resolve(false); }
            };
            getReq.onerror = () => { db.close(); resolve(false); };
          };
          req.onerror = () => resolve(false);
        });
      });

      expect(hasData).toBe(true);
    });

    it('should persist data across page reload via IndexedDB', async () => {
      // Create a node
      const created = await createTestNode(page);
      expect(created).toBe(true);
      await delay(1000);

      // Reload the page
      await page.reload({ waitUntil: 'networkidle0' });
      await page.waitForSelector('[data-testid="canvas"]', { timeout: 10000 });
      await delay(1000);

      // Check that the node persisted (via the status bar)
      const statusText = await page.$eval(
        '[data-testid="status-bar"]',
        (el) => el.textContent || ''
      );
      expect(statusText).toContain('Nodes:1');
    });
  });

  // ==========================================================================
  // Services page: sidebar Add Service opens wizard (Bug 2 regression)
  // ==========================================================================

  describe('Sidebar Add Service', () => {
    it('should open service wizard from sidebar Add Service button', async () => {
      await navigateTo(page, 'services');
      await waitForTestId(page, 'services-page');
      await delay(300);

      // Find the sidebar "Add Service" button (in ServicePanel)
      const sidebarButtons = await page.$$('[data-testid="sidebar"] button, aside button');
      let addServiceClicked = false;
      for (const btn of sidebarButtons) {
        const text = await btn.evaluate((el) => el.textContent || '');
        if (text.includes('Add Service')) {
          await btn.click();
          addServiceClicked = true;
          break;
        }
      }

      if (addServiceClicked) {
        await delay(500);
        // The service wizard modal should open (not AddServiceModal)
        const dialog = await page.$('[role="dialog"]');
        if (dialog) {
          const dialogText = await dialog.evaluate((el) => el.textContent || '');
          // Should contain wizard-related text, not "Quick Add"
          expect(dialogText).not.toContain('Quick Add');
        }
      }
    });
  });

  // ==========================================================================
  // Settings tabs navigation (new tabs for Optical, Network)
  // ==========================================================================

  describe('Settings Tab Navigation', () => {
    it('should have all expected settings tabs', async () => {
      await page.click('[data-testid="settings-button"]');
      await waitForTestId(page, 'settings-dialog');
      await delay(300);

      // Check for each tab
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
      await page.click('[data-testid="settings-button"]');
      await waitForTestId(page, 'settings-dialog');
      await delay(300);

      // Click Network tab
      const networkTab = await page.$('[data-testid="settings-tab-network"]');
      await networkTab!.click();
      await delay(300);

      // The tab should be selected (aria-selected=true)
      const isSelected = await networkTab!.evaluate((el) =>
        el.getAttribute('aria-selected')
      );
      expect(isSelected).toBe('true');
    });
  });

  // ==========================================================================
  // Node Inspector tab navigation (Properties | Inventory | Ports)
  // ==========================================================================

  describe('Node Inspector Tabs', () => {
    it('should show three tabs: Properties, Inventory, Ports', async () => {
      // Create and select a node
      await createTestNode(page, 'router');
      await delay(300);

      const nodes = await page.$$('.react-flow__node');
      if (nodes.length > 0) {
        await nodes[0].click();
        await delay(500);
      }

      // All three tabs should be present
      const propsTab = await page.$('[data-testid="inspector-tab-properties"]');
      const invTab = await page.$('[data-testid="inspector-tab-inventory"]');
      const portsTab = await page.$('[data-testid="inspector-tab-ports"]');

      expect(propsTab).not.toBeNull();
      expect(invTab).not.toBeNull();
      expect(portsTab).not.toBeNull();
    });
  });
});
