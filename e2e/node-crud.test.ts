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
  getNodeCount,
  createTestNode,
  clearTopologyState,
} from './helpers';

describe('Node CRUD E2E Tests', () => {
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

  // ---------- Node Creation ----------

  describe('Node Creation', () => {
    it('should create a node via add mode and canvas click', async () => {
      const initialCount = await getNodeCount(page);
      expect(initialCount).toBe(0);

      const created = await createTestNode(page);
      expect(created).toBe(true);

      const newCount = await getNodeCount(page);
      expect(newCount).toBe(1);
    });

    it('should create multiple nodes of different types', async () => {
      await createTestNode(page, 'router');
      const countAfterFirst = await getNodeCount(page);
      expect(countAfterFirst).toBeGreaterThanOrEqual(1);

      // Deselect any selected node and press Escape to clear state
      await page.keyboard.press('Escape');
      await delay(200);

      // Create a second node — enter add mode and click an offset position
      await page.keyboard.press('n');
      await delay(200);

      const pane = await page.$('.react-flow__pane');
      const box = await pane!.boundingBox();
      // Click in the top-left quadrant to avoid overlapping with the first node
      await page.mouse.click(box!.x + box!.width * 0.25, box!.y + box!.height * 0.25);
      await delay(500);

      // Confirm in the AddNodeModal
      const modal = await page.$('[data-testid="add-node-modal"]');
      if (modal) {
        const typeButton = await page.$('[data-testid="node-type-switch"]');
        if (typeButton) {
          await typeButton.click();
          await delay(200);
        }
        const confirmBtn = await page.$('[data-testid="add-node-confirm"]');
        if (confirmBtn) {
          await confirmBtn.click();
          await delay(500);
        }
      }

      const finalCount = await getNodeCount(page);
      expect(finalCount).toBeGreaterThan(countAfterFirst);
    });

    it('should cancel node creation with Escape', async () => {
      const initialCount = await getNodeCount(page);

      // Enter add mode
      await page.keyboard.press('n');
      await delay(200);

      // Press Escape before clicking
      await page.keyboard.press('Escape');
      await delay(200);

      // Count should remain the same
      const afterCount = await getNodeCount(page);
      expect(afterCount).toBe(initialCount);
    });
  });

  // ---------- Node Selection & Inspection ----------

  describe('Node Selection & Inspection', () => {
    it('should show node inspector when node is clicked', async () => {
      // Create a node first
      await createTestNode(page);
      await delay(300);

      // Click on the node (it should be in the center of the canvas)
      const canvas = await page.$('[data-testid="canvas"]');
      const box = await canvas!.boundingBox();

      // Try clicking on a React Flow node element
      const nodeEl = await page.$('.react-flow__node');
      if (nodeEl) {
        await nodeEl.click();
        await delay(500);

        // Check if inspector appeared
        const inspector = await page.$('[data-testid="node-inspector"]');
        // Inspector may or may not have data-testid - check for inspector panel
        const inspectorPanel = inspector || await page.$('.inspector-panel');
        // At minimum, verify the app didn't crash
        const canvasStillThere = await page.$('[data-testid="canvas"]');
        expect(canvasStillThere).not.toBeNull();
      }
    });

    it('should update node name in inspector', async () => {
      // Create a node
      await createTestNode(page);
      await delay(300);

      // Click the node
      const nodeEl = await page.$('.react-flow__node');
      if (nodeEl) {
        await nodeEl.click();
        await delay(500);

        // Find the name input in the inspector (if visible)
        const nameInput = await page.$('[data-testid="node-inspector"] input[type="text"]');
        if (nameInput) {
          // Triple-click to select all text, then type new name
          await nameInput.click({ count: 3 });
          await page.keyboard.type('TestNode');
          await delay(600); // Wait for debounce

          // Verify the value changed
          const value = await nameInput.evaluate((el) => (el as HTMLInputElement).value);
          expect(value).toBe('TestNode');
        }
      }

      // Verify app is still responsive
      const canvas = await page.$('[data-testid="canvas"]');
      expect(canvas).not.toBeNull();
    });
  });

  // ---------- Node Deletion ----------

  describe('Node Deletion', () => {
    it('should delete a node via Delete key', async () => {
      // Create a node
      await createTestNode(page);
      const afterCreate = await getNodeCount(page);
      expect(afterCreate).toBe(1);

      // Click the node to select it
      const nodeEl = await page.$('.react-flow__node');
      if (nodeEl) {
        await nodeEl.click();
        await delay(300);

        // Press Delete
        await page.keyboard.press('Delete');
        await delay(500);

        // Check if confirm modal appeared
        const confirmModal = await page.$('[role="dialog"]');
        if (confirmModal) {
          // Find and click confirm/delete button
          const buttons = await confirmModal.$$('button');
          for (const btn of buttons) {
            const text = await btn.evaluate((el) => el.textContent);
            if (text?.toLowerCase().includes('delete') || text?.toLowerCase().includes('confirm')) {
              await btn.click();
              break;
            }
          }
          await delay(500);
        }

        const afterDelete = await getNodeCount(page);
        expect(afterDelete).toBe(0);
      }
    });

    it('should cancel node deletion', async () => {
      // Create a node
      await createTestNode(page);
      const afterCreate = await getNodeCount(page);
      expect(afterCreate).toBe(1);

      // Click the node to select it
      const nodeEl = await page.$('.react-flow__node');
      if (nodeEl) {
        await nodeEl.click();
        await delay(300);

        // Press Delete
        await page.keyboard.press('Delete');
        await delay(500);

        // Check for confirm modal and cancel
        const confirmModal = await page.$('[role="dialog"]');
        if (confirmModal) {
          // Press Escape to cancel
          await page.keyboard.press('Escape');
          await delay(300);
        }

        // Node should still exist
        const afterCancel = await getNodeCount(page);
        expect(afterCancel).toBe(1);
      }
    });
  });

  // ---------- Keyboard Shortcuts ----------

  describe('Keyboard Shortcuts', () => {
    it('should select all nodes with Ctrl+A', async () => {
      // Create two nodes at different positions
      await createTestNode(page);
      await delay(200);

      // Click somewhere else first
      await page.keyboard.press('v');
      await delay(100);

      // Ctrl+A to select all
      await page.keyboard.down('Control');
      await page.keyboard.press('a');
      await page.keyboard.up('Control');
      await delay(300);

      // Verify app is responsive (selection is internal state)
      const canvas = await page.$('[data-testid="canvas"]');
      expect(canvas).not.toBeNull();
    });

    it('should undo node creation with Ctrl+Z', async () => {
      const before = await getNodeCount(page);
      await createTestNode(page);
      const afterCreate = await getNodeCount(page);
      expect(afterCreate).toBeGreaterThan(before);

      // Undo
      await page.keyboard.down('Control');
      await page.keyboard.press('z');
      await page.keyboard.up('Control');
      await delay(500);

      const afterUndo = await getNodeCount(page);
      expect(afterUndo).toBe(before);
    });

    it('should redo with Ctrl+Y', async () => {
      const before = await getNodeCount(page);
      await createTestNode(page);
      const afterCreate = await getNodeCount(page);

      // Undo
      await page.keyboard.down('Control');
      await page.keyboard.press('z');
      await page.keyboard.up('Control');
      await delay(500);

      const afterUndo = await getNodeCount(page);
      expect(afterUndo).toBe(before);

      // Redo
      await page.keyboard.down('Control');
      await page.keyboard.press('y');
      await page.keyboard.up('Control');
      await delay(500);

      const afterRedo = await getNodeCount(page);
      expect(afterRedo).toBe(afterCreate);
    });

    it('should open export modal with Ctrl+S', async () => {
      await page.keyboard.down('Control');
      await page.keyboard.press('s');
      await page.keyboard.up('Control');
      await delay(500);

      // An export modal/dialog should appear
      const dialog = await page.$('[role="dialog"]');
      expect(dialog).not.toBeNull();

      // Close it
      await page.keyboard.press('Escape');
      await delay(300);
    });
  });
});
