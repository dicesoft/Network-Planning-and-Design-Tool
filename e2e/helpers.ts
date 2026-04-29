import puppeteer, { Browser, Page } from 'puppeteer';
import fs from 'fs';
import path from 'path';

/**
 * Resolve the base URL for E2E tests.
 * Priority: TEST_URL env var > port file written by globalSetup > default port 3000.
 */
function resolveBaseUrl(): string {
  if (process.env.TEST_URL) return process.env.TEST_URL;
  const portFile = path.join(__dirname, 'artifacts', '.e2e-port');
  try {
    const port = fs.readFileSync(portFile, 'utf-8').trim();
    if (port) return `http://localhost:${port}`;
  } catch { /* port file not found — use default */ }
  return 'http://localhost:3000';
}

export const BASE_URL = resolveBaseUrl();

const ARTIFACTS_DIR = path.join(process.cwd(), 'e2e', 'artifacts');
const SCREENSHOTS_DIR = path.join(ARTIFACTS_DIR, 'screenshots');
const LOGS_DIR = path.join(ARTIFACTS_DIR, 'logs');
const REPORTS_DIR = path.join(ARTIFACTS_DIR, 'reports');

// Ensure artifact directories exist
function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

ensureDir(SCREENSHOTS_DIR);
ensureDir(LOGS_DIR);
ensureDir(REPORTS_DIR);

export async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
    ],
  });
}

export async function createPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  return page;
}

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sanitize a test name for use as a filename.
 */
function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);
}

/**
 * Capture a screenshot and save it to e2e/artifacts/screenshots/.
 * Returns the absolute file path so Claude can read it.
 */
export async function captureScreenshot(page: Page, name: string): Promise<string> {
  ensureDir(SCREENSHOTS_DIR);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${sanitizeName(name)}-${timestamp}.png`;
  const filepath = path.join(SCREENSHOTS_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: true });
  return filepath;
}

/**
 * Create a console log capture attached to a page.
 * Call `attach()` to start capturing, `getLogs()` to retrieve captured messages.
 */
export function captureConsoleLogs(page: Page): { attach: () => void; getLogs: () => string[] } {
  const logs: string[] = [];

  function attach() {
    page.on('console', (msg) => {
      const type = msg.type();
      const text = msg.text();
      logs.push(`[${type}] ${text}`);
    });

    page.on('pageerror', (err) => {
      logs.push(`[pageerror] ${err.message}`);
    });
  }

  function getLogs() {
    return logs;
  }

  return { attach, getLogs };
}

/**
 * Write a text artifact to e2e/artifacts/{name}.
 * Returns the absolute file path.
 */
export function writeArtifact(name: string, content: string): string {
  const filepath = path.join(ARTIFACTS_DIR, name);
  ensureDir(path.dirname(filepath));
  fs.writeFileSync(filepath, content, 'utf-8');
  return filepath;
}

// ============================================================================
// Navigation & Page Helpers
// ============================================================================

/**
 * Navigate to a page via the header nav link.
 * Falls back to direct URL navigation if the nav link isn't found.
 */
export async function navigateTo(page: Page, route: string): Promise<void> {
  const testId = `nav-${route}`;
  const navLink = await page.$(`[data-testid="${testId}"]`);
  if (navLink) {
    await navLink.click();
    await delay(300);
  } else {
    const path = route === 'topology' ? '/' : `/${route}`;
    await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle0' });
  }
}

/**
 * Wait for an element with the given data-testid to appear.
 */
export async function waitForTestId(page: Page, testId: string, timeout = 10000): Promise<void> {
  await page.waitForSelector(`[data-testid="${testId}"]`, { timeout });
}

/**
 * Parse the node count from the status bar text (format: "Nodes:X").
 */
export async function getNodeCount(page: Page): Promise<number> {
  const text = await page.$eval('[data-testid="status-bar"]', (el) => el.textContent || '');
  const match = text.match(/Nodes:(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Parse the edge count from the status bar text (format: "Edges:X").
 */
export async function getEdgeCount(page: Page): Promise<number> {
  const text = await page.$eval('[data-testid="status-bar"]', (el) => el.textContent || '');
  const match = text.match(/Edges:(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Create a test node by entering add mode, clicking the canvas, and confirming.
 * Returns true if the node count increased.
 */
export async function createTestNode(page: Page, type?: string, _name?: string): Promise<boolean> {
  const before = await getNodeCount(page);

  // Enter add-node mode
  await page.keyboard.press('n');
  await delay(200);

  // Click center of canvas — target the ReactFlow pane layer
  const pane = await page.$('.react-flow__pane');
  if (!pane) return false;
  const box = await pane.boundingBox();
  if (!box) return false;

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await delay(500);

  // Wait for the AddNodeModal to appear
  const modal = await page.$('[data-testid="add-node-modal"]');
  if (modal) {
    // Select node type if specified
    const nodeType = type || 'router';
    const typeButton = await page.$(`[data-testid="node-type-${nodeType}"]`);
    if (typeButton) {
      await typeButton.click();
      await delay(200);
    }

    // Click the "Add Node" confirm button to submit the form
    const confirmBtn = await page.$('[data-testid="add-node-confirm"]');
    if (confirmBtn) {
      await confirmBtn.click();
      await delay(500);
    }
  }

  const after = await getNodeCount(page);
  return after > before;
}

/**
 * Clear topology state by removing store keys from both localStorage and IndexedDB,
 * then reloading. Waits for the canvas to be ready afterward.
 *
 * Sprint 4 migrated persistence from localStorage to IndexedDB (atlas-network-db).
 */
export async function clearTopologyState(page: Page): Promise<void> {
  await page.evaluate(async () => {
    // Clear localStorage (legacy / migration safety copies)
    localStorage.removeItem('network-topology-storage');
    localStorage.removeItem('service-store');
    localStorage.removeItem('settings-store');
    localStorage.removeItem('event-store');
    localStorage.removeItem('atlas-idb-migration');

    // Clear IndexedDB stores
    await new Promise<void>((resolve) => {
      const req = indexedDB.open('atlas-network-db');
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('zustand-persist')) {
          db.close();
          resolve();
          return;
        }
        const tx = db.transaction('zustand-persist', 'readwrite');
        tx.objectStore('zustand-persist').clear();
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); resolve(); };
      };
      req.onerror = () => resolve();
    });
  });
  await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="canvas"]', { timeout: 10000 });
}
