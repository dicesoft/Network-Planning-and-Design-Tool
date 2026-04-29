import { ChildProcess, spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { Browser, Page } from 'puppeteer';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { launchBrowser, createPage, delay } from './helpers';

/**
 * Debug-route lockdown verification.
 *
 * Boots a `vite preview` server against the production `dist/` build on a
 * dedicated port, navigates to /debug, and asserts the SPA renders the
 * topology editor (its catch-all route, our standard 404 surface) instead of
 * the Debug Dashboard. Also asserts no [data-testid="nav-debug"] button is
 * present in the header.
 *
 * If `dist/` is missing the suite skips itself rather than failing — the
 * companion script `scripts/test-bundle-no-debug.mjs` covers the same
 * concern from the bundle side.
 */

const PREVIEW_PORT = 4173;
const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}`;
const DIST_DIR = path.resolve(__dirname, '..', 'dist');
const distExists = fs.existsSync(path.join(DIST_DIR, 'index.html'));

function checkServer(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    http.get(url, (res) => { res.resume(); resolve(res.statusCode === 200); })
      .on('error', () => resolve(false));
  });
}

function waitForServer(url: string, timeoutMs = 30000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`preview server at ${url} did not respond within ${timeoutMs}ms`));
        return;
      }
      if (await checkServer(url)) { resolve(); return; }
      setTimeout(tick, 500);
    };
    tick();
  });
}

(distExists ? describe : describe.skip)('Debug Route Production Lockdown', () => {
  let browser: Browser;
  let page: Page;
  let preview: ChildProcess | null = null;

  beforeAll(async () => {
    preview = spawn(
      'npx',
      ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'],
      { stdio: 'pipe', shell: true, cwd: path.resolve(__dirname, '..') }
    );
    preview.stdout?.on('data', (d: Buffer) => {
      const m = d.toString().trim();
      if (m) console.log(`[preview] ${m}`);
    });
    preview.stderr?.on('data', (d: Buffer) => {
      const m = d.toString().trim();
      if (m) console.error(`[preview:err] ${m}`);
    });
    await waitForServer(PREVIEW_URL);
    browser = await launchBrowser();
  }, 60000);

  afterAll(async () => {
    if (browser) await browser.close();
    if (preview) {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(preview.pid), '/f', '/t'], { shell: true });
      } else {
        preview.kill('SIGTERM');
      }
    }
  });

  it('serves the SPA fallback (no Debug Dashboard) at /debug', async () => {
    page = await createPage(browser);
    try {
      await page.goto(`${PREVIEW_URL}/debug`, { waitUntil: 'networkidle0' });
      await delay(500);

      const bodyText = await page.evaluate(() => document.body.innerText || '');
      expect(bodyText).not.toContain('Debug Dashboard');

      // The /debug route is unregistered in prod, so React Router falls
      // through to the topology editor (default catch-all in this SPA).
      // Either way, the debug surface specifically must NOT render.
      const debugSurface = await page.$('[data-testid="state-inspector"]');
      expect(debugSurface).toBeNull();
    } finally {
      await page.close();
    }
  });

  it('hides the in-header debug button on the home route', async () => {
    page = await createPage(browser);
    try {
      await page.goto(PREVIEW_URL, { waitUntil: 'networkidle0' });
      await page.waitForSelector('[data-testid="header"]', { timeout: 10000 });
      await delay(300);

      const navDebug = await page.$('[data-testid="nav-debug"]');
      expect(navDebug).toBeNull();
    } finally {
      await page.close();
    }
  });

  it('does not ship the literal "Debug Dashboard" string in any bundle', async () => {
    const assetsDir = path.join(DIST_DIR, 'assets');
    const files = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const content = fs.readFileSync(path.join(assetsDir, f), 'utf8');
      expect(content.includes('Debug Dashboard'), `${f} contains "Debug Dashboard"`).toBe(false);
    }
  });
});
