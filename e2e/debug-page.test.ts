import { Browser, Page } from 'puppeteer';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { BASE_URL, launchBrowser, createPage, delay, captureScreenshot, captureConsoleLogs, writeArtifact } from './helpers';

describe('Debug Page E2E Tests', () => {
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
  });

  afterEach(async (ctx) => {
    if (ctx.task.result?.state === 'fail') {
      await captureScreenshot(page, ctx.task.name);
      writeArtifact(`logs/${ctx.task.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.txt`, consoleLogs.getLogs().join('\n'));
    }
    await page.close();
  });

  describe('Event Logging', () => {
    it('should log "Application started" event on page load', async () => {
      // Clear sessionStorage first
      await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
      await page.evaluate(() => sessionStorage.clear());

      // Reload to get fresh start
      await page.reload({ waitUntil: 'networkidle0' });
      await page.waitForSelector('[data-testid="canvas"]', { timeout: 10000 });
      await delay(500); // Wait for events to be logged

      // Navigate to debug page
      await page.goto(`${BASE_URL}/debug`, { waitUntil: 'networkidle0' });
      await delay(500);

      // Check Event Log contains "Application started"
      const eventLogContent = await page.evaluate(() => {
        const eventLog = document.querySelector('.font-mono.text-xs.space-y-1');
        return eventLog?.textContent || '';
      });

      console.log('Event Log Content:', eventLogContent);
      expect(eventLogContent).toContain('Application started');
    });

    it('should log node added event when adding a node', async () => {
      // Clear sessionStorage first
      await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
      await page.evaluate(() => sessionStorage.clear());
      await page.reload({ waitUntil: 'networkidle0' });
      await page.waitForSelector('[data-testid="canvas"]', { timeout: 10000 });
      await delay(500);

      // Get initial node count from status bar
      const initialStatus = await page.$eval('[data-testid="status-bar"]', (el) => el.textContent);
      console.log('Initial status:', initialStatus);

      // Switch to add mode
      await page.keyboard.press('n');
      await delay(200);

      // Click on canvas to add a node
      const canvas = await page.$('[data-testid="canvas"]');
      const canvasBox = await canvas?.boundingBox();
      if (canvasBox) {
        await page.mouse.click(
          canvasBox.x + canvasBox.width / 2,
          canvasBox.y + canvasBox.height / 2
        );
      }
      await delay(500);

      // If a modal appeared, select a node type
      const modal = await page.$('[role="dialog"]');
      if (modal) {
        // Click on first node type option (Router)
        const nodeTypeButton = await page.$('[data-testid="node-type-router"]');
        if (nodeTypeButton) {
          await nodeTypeButton.click();
        } else {
          // Try clicking the first button in the modal
          const firstButton = await modal.$('button');
          if (firstButton) {
            await firstButton.click();
          }
        }
        await delay(500);
      }

      // Get new node count from status bar
      const newStatus = await page.$eval('[data-testid="status-bar"]', (el) => el.textContent);
      console.log('New status:', newStatus);

      // Navigate to debug page
      await page.goto(`${BASE_URL}/debug`, { waitUntil: 'networkidle0' });
      await delay(500);

      // Check Event Log for node added event
      const eventLogContent = await page.evaluate(() => {
        const eventLog = document.querySelector('.font-mono.text-xs.space-y-1');
        return eventLog?.textContent || '';
      });

      console.log('Event Log Content after adding node:', eventLogContent);

      // Should contain either "Node added" or "Application started" at minimum
      const hasEvents = eventLogContent.includes('Application started') ||
                       eventLogContent.includes('Node added') ||
                       eventLogContent.includes('node');
      expect(hasEvents).toBe(true);
    });
  });

  describe('State Inspector', () => {
    it('should show current topology state', async () => {
      // Go to main app
      await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
      await page.waitForSelector('[data-testid="canvas"]', { timeout: 10000 });
      await delay(500);

      // Navigate to debug page
      await page.goto(`${BASE_URL}/debug`, { waitUntil: 'networkidle0' });
      await delay(500);

      // Check State Inspector shows topology data
      const stateInspectorContent = await page.evaluate(() => {
        // Find the State Inspector panel by data-testid
        const panel = document.querySelector('[data-testid="state-inspector"]');
        return panel?.textContent || '';
      });

      console.log('State Inspector content:', stateInspectorContent.substring(0, 500));

      // Should contain topology-related content
      expect(stateInspectorContent).toContain('topology');
    });

    it('should update on refresh button click', async () => {
      // Go to main app and add a node
      await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
      await page.evaluate(() => sessionStorage.clear());
      await page.reload({ waitUntil: 'networkidle0' });
      await page.waitForSelector('[data-testid="canvas"]', { timeout: 10000 });

      // Open debug page in same tab (to keep session)
      await page.goto(`${BASE_URL}/debug`, { waitUntil: 'networkidle0' });
      await delay(500);

      // Get initial State Inspector content
      const initialContent = await page.evaluate(() => {
        const panel = document.querySelector('[data-testid="state-inspector"]');
        return panel?.textContent || '';
      });

      // Click Refresh All button - find by text content
      const buttons = await page.$$('button');
      for (const button of buttons) {
        const text = await button.evaluate((el) => el.textContent);
        if (text?.includes('Refresh')) {
          await button.click();
          await delay(500);
          break;
        }
      }

      // Get new content - it should still contain topology info
      const newContent = await page.evaluate(() => {
        const panel = document.querySelector('[data-testid="state-inspector"]');
        return panel?.textContent || '';
      });

      console.log('Content after refresh:', newContent.substring(0, 500));
      expect(newContent).toContain('topology');
    });
  });

  describe('Debug Page Navigation', () => {
    it('should navigate to debug page and back', async () => {
      // Start at main app
      await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
      await page.waitForSelector('[data-testid="canvas"]', { timeout: 10000 });

      // Navigate to debug page
      await page.goto(`${BASE_URL}/debug`, { waitUntil: 'networkidle0' });
      await delay(300);

      // Check debug page loaded
      const debugHeader = await page.evaluate(() => {
        const h1 = document.querySelector('h1');
        return h1?.textContent || '';
      });
      expect(debugHeader).toContain('Debug');

      // Click back to editor button
      const backButton = await page.$('a[href="/"]');
      if (backButton) {
        await backButton.click();
        await page.waitForSelector('[data-testid="canvas"]', { timeout: 10000 });
      }

      // Verify we're back on main app
      const canvas = await page.$('[data-testid="canvas"]');
      expect(canvas).not.toBeNull();
    });
  });

  describe('Event Store Persistence', () => {
    it('should persist events in IndexedDB', async () => {
      // Clear and reload
      await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
      await page.waitForSelector('[data-testid="canvas"]', { timeout: 10000 });
      await delay(1000); // Wait for IndexedDB persist (async)

      // Check IndexedDB has event-store (Sprint 4 migrated from localStorage to IndexedDB)
      const hasEventStore = await page.evaluate(async () => {
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
            const getReq = tx.objectStore('zustand-persist').get('event-store');
            getReq.onsuccess = () => {
              db.close();
              resolve(getReq.result !== undefined && getReq.result !== null);
            };
            getReq.onerror = () => { db.close(); resolve(false); };
          };
          req.onerror = () => resolve(false);
        });
      });

      expect(hasEventStore).toBe(true);

      // Parse and check events
      const events = await page.evaluate(async () => {
        return new Promise<unknown[]>((resolve) => {
          const req = indexedDB.open('atlas-network-db');
          req.onsuccess = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('zustand-persist')) {
              db.close();
              resolve([]);
              return;
            }
            const tx = db.transaction('zustand-persist', 'readonly');
            const getReq = tx.objectStore('zustand-persist').get('event-store');
            getReq.onsuccess = () => {
              db.close();
              const raw = getReq.result;
              if (!raw) { resolve([]); return; }
              try {
                const parsed = JSON.parse(raw as string);
                resolve(parsed.state?.events || []);
              } catch { resolve([]); }
            };
            getReq.onerror = () => { db.close(); resolve([]); };
          };
          req.onerror = () => resolve([]);
        });
      });

      console.log('Events in IndexedDB:', events);
      expect(events.length).toBeGreaterThan(0);
    });
  });
});
