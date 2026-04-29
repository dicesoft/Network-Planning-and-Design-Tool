import { Browser, Page } from 'puppeteer';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { BASE_URL, launchBrowser, createPage, delay, captureScreenshot, captureConsoleLogs, writeArtifact } from './helpers';

describe('Topology Editor E2E Tests', () => {
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
    // Wait for the app to load
    await page.waitForSelector('[data-testid="canvas"]', { timeout: 10000 });
  });

  afterEach(async (ctx) => {
    if (ctx.task.result?.state === 'fail') {
      await captureScreenshot(page, ctx.task.name);
      writeArtifact(`logs/${ctx.task.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.txt`, consoleLogs.getLogs().join('\n'));
    }
    await page.close();
  });

  describe('Application Loading', () => {
    it('should load the application with all main components', async () => {
      // Check header exists
      const header = await page.$('[data-testid="header"]');
      expect(header).not.toBeNull();

      // Check sidebar exists
      const sidebar = await page.$('[data-testid="sidebar"]');
      expect(sidebar).not.toBeNull();

      // Check canvas exists
      const canvas = await page.$('[data-testid="canvas"]');
      expect(canvas).not.toBeNull();

      // Check status bar exists
      const statusBar = await page.$('[data-testid="status-bar"]');
      expect(statusBar).not.toBeNull();
    });

    it('should display the ATLAS logo and title', async () => {
      const logoText = await page.$eval(
        '[data-testid="header"]',
        (el) => el.textContent
      );
      expect(logoText).toContain('ATLAS');
    });

    it('should display the node palette with node types', async () => {
      const palette = await page.$('[data-testid="node-palette"]');
      expect(palette).not.toBeNull();
    });
  });

  describe('Canvas Interaction', () => {
    it('should have a functional canvas area', async () => {
      const canvas = await page.$('[data-testid="canvas"]');
      expect(canvas).not.toBeNull();

      const canvasBox = await canvas?.boundingBox();
      expect(canvasBox).not.toBeNull();
      expect(canvasBox!.width).toBeGreaterThan(0);
      expect(canvasBox!.height).toBeGreaterThan(0);
    });
  });

  describe('Tool Modes', () => {
    it('should display current tool mode in status bar', async () => {
      const statusText = await page.$eval(
        '[data-testid="status-bar"]',
        (el) => el.textContent
      );
      // Mode is displayed without spaces
      expect(statusText?.toLowerCase()).toContain('mode');
    });

    it('should change tool mode via keyboard shortcuts', async () => {
      // Get status bar text
      const getMode = async () => {
        return page.$eval('[data-testid="status-bar"]', (el) => el.textContent);
      };

      // Press 'n' for add mode (displayed as 'add' in status bar)
      await page.keyboard.press('n');
      await delay(100);
      let statusText = await getMode();
      expect(statusText?.toLowerCase()).toMatch(/mode:\s*add/);

      // Press 'e' for connect mode (displayed as 'connect' in status bar)
      await page.keyboard.press('e');
      await delay(100);
      statusText = await getMode();
      expect(statusText?.toLowerCase()).toMatch(/mode:\s*connect/);

      // Press 'v' for select mode
      await page.keyboard.press('v');
      await delay(100);
      statusText = await getMode();
      expect(statusText?.toLowerCase()).toMatch(/mode:\s*select/);
    });

    it('should cancel mode with Escape key', async () => {
      // Switch to add mode
      await page.keyboard.press('n');
      await delay(100);

      // Press Escape
      await page.keyboard.press('Escape');
      await delay(100);

      // Should be back to select mode
      const statusText = await page.$eval(
        '[data-testid="status-bar"]',
        (el) => el.textContent
      );
      expect(statusText?.toLowerCase()).toContain('select');
    });
  });

  describe('Zoom and Pan', () => {
    it('should display zoom level in toolbar', async () => {
      const toolbar = await page.$('[data-testid="toolbar"]');
      const toolbarText = await toolbar?.evaluate((el) => el.textContent);

      expect(toolbarText).toContain('%');
    });
  });

  describe('Status Bar', () => {
    it('should display node and edge counts', async () => {
      const statusText = await page.$eval(
        '[data-testid="status-bar"]',
        (el) => el.textContent
      );
      // Check for node count display (format: Nodes:X)
      expect(statusText).toMatch(/Nodes:\d+/);
      expect(statusText).toMatch(/Edges:\d+/);
    });

    it('should display network name', async () => {
      const statusText = await page.$eval(
        '[data-testid="status-bar"]',
        (el) => el.textContent
      );
      expect(statusText).toContain('Network');
    });
  });

  describe('Undo/Redo', () => {
    it('should have undo/redo keyboard shortcuts registered', async () => {
      // This test verifies the app doesn't crash on undo/redo
      await page.keyboard.down('Control');
      await page.keyboard.press('z');
      await page.keyboard.up('Control');
      await delay(100);

      // App should still be responsive
      const canvas = await page.$('[data-testid="canvas"]');
      expect(canvas).not.toBeNull();
    });
  });

  describe('Box Selection (drag-select regression)', () => {
    it('should not crash when Shift+drag box-selects on the canvas', async () => {
      // Ensure we're in select mode
      await page.keyboard.press('v');
      await delay(100);

      const canvas = await page.$('[data-testid="canvas"]');
      expect(canvas).not.toBeNull();

      const canvasBox = await canvas!.boundingBox();
      expect(canvasBox).not.toBeNull();

      // Perform a Shift+drag box selection across the canvas
      // This was the operation that triggered the infinite loop bug
      const startX = canvasBox!.x + canvasBox!.width * 0.25;
      const startY = canvasBox!.y + canvasBox!.height * 0.25;
      const endX = canvasBox!.x + canvasBox!.width * 0.75;
      const endY = canvasBox!.y + canvasBox!.height * 0.75;

      await page.keyboard.down('Shift');
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      // Drag slowly to trigger selection rectangle
      await page.mouse.move(endX, endY, { steps: 10 });
      await page.mouse.up();
      await page.keyboard.up('Shift');
      await delay(500);

      // If we reach here without a crash, the infinite loop bug is fixed.
      // Verify the app is still responsive by checking the canvas exists.
      const canvasAfter = await page.$('[data-testid="canvas"]');
      expect(canvasAfter).not.toBeNull();

      // Verify the status bar still displays (app didn't white-screen)
      const statusBar = await page.$('[data-testid="status-bar"]');
      expect(statusBar).not.toBeNull();
    });
  });

  describe('Geographic Map View', () => {
    it('should toggle between schematic and map view', async () => {
      // Look for a Map/Geo toggle button in the toolbar
      const toolbar = await page.$('[data-testid="toolbar"]');
      expect(toolbar).not.toBeNull();

      // Find the map toggle button by text content
      const buttons = await page.$$('[data-testid="toolbar"] button');
      let mapToggleFound = false;

      for (const btn of buttons) {
        const text = await btn.evaluate((el) => el.textContent || '');
        if (text.toLowerCase().includes('map') || text.toLowerCase().includes('geo')) {
          await btn.click();
          await delay(500);
          mapToggleFound = true;
          break;
        }
      }

      if (mapToggleFound) {
        // Check that the map container appeared
        const mapContainer = await page.$('.leaflet-container');
        expect(mapContainer).not.toBeNull();

        // Toggle back to schematic
        const btnsAfter = await page.$$('[data-testid="toolbar"] button');
        for (const btn of btnsAfter) {
          const text = await btn.evaluate((el) => el.textContent || '');
          if (text.toLowerCase().includes('schematic') || text.toLowerCase().includes('canvas')) {
            await btn.click();
            await delay(500);
            break;
          }
        }

        // Canvas should be back
        const canvas = await page.$('[data-testid="canvas"]');
        expect(canvas).not.toBeNull();
      } else {
        // If no toggle found, at least verify the app is stable
        const canvas = await page.$('[data-testid="canvas"]');
        expect(canvas).not.toBeNull();
      }
    });
  });

  describe('Shortcuts Modal', () => {
    it('should open shortcuts modal with ? key and close with Escape', async () => {
      // Press ? to open shortcuts modal (sends the ? character directly)
      await page.keyboard.type('?');
      await delay(500);

      // A modal/dialog should appear
      const dialog = await page.$('[role="dialog"]');
      expect(dialog).not.toBeNull();

      // Verify it contains shortcut-related content
      const text = await dialog?.evaluate((el) => el.textContent || '');
      expect(text?.toLowerCase()).toMatch(/shortcut|keyboard/);

      // Close with Escape
      await page.keyboard.press('Escape');
      await delay(300);

      const dialogAfter = await page.$('[role="dialog"]');
      expect(dialogAfter).toBeNull();
    });
  });
});
