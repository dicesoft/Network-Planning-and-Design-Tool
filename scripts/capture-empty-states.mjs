// Capture empty-state screenshots for all 14 primary surfaces (P5.6).
// Usage: node scripts/capture-empty-states.mjs [baseUrl]
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const baseUrl = process.argv[2] || 'http://localhost:3005';
const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'docs', 'plans', 'app-improvements-apr2026', 'screenshots', 'empty-states');
mkdirSync(outDir, { recursive: true });

const surfaces = [
  { id: '01-topology-editor', path: '/' },
  { id: '02-services', path: '/services' },
  { id: '03-capacity-dashboard', path: '/capacity' },
  { id: '04-what-if', path: '/capacity', tab: 'What-If' },
  { id: '05-lambda-study', path: '/capacity', tab: 'Lambda Study' },
  { id: '06-defragmentation', path: '/capacity', tab: 'Defragmentation' },
  { id: '07-fiber-cut-simulation', path: '/simulation' },
  { id: '08-network-health-check', path: '/simulation', tab: 'Network Health Check' },
  { id: '09-exhaustive-simulation', path: '/simulation', tab: 'Exhaustive Analysis' },
  { id: '10-reports', path: '/reports' },
  { id: '11-tools', path: '/tools' },
  { id: '12-forecast', path: '/forecast' },
  { id: '13-settings', path: '/', settings: true },
  { id: '14-geomap', path: '/', map: true },
];

const browser = await puppeteer.launch({
  headless: 'new',
  defaultViewport: { width: 1440, height: 900 },
  args: ['--no-sandbox'],
});
const page = await browser.newPage();

// Prime: clear storage once
await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 30000 });
await page.evaluate(async () => {
  localStorage.clear();
  const dbs = await indexedDB.databases();
  for (const d of dbs) indexedDB.deleteDatabase(d.name);
});
await new Promise((r) => setTimeout(r, 500));

const results = [];

for (const s of surfaces) {
  try {
    await page.goto(baseUrl + s.path, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1500));

    if (s.tab) {
      // Click the tab by exact text (subnav buttons)
      const clicked = await page.evaluate((label) => {
        const btns = [...document.querySelectorAll('button, [role="tab"]')];
        const lower = label.toLowerCase();
        const b = btns.find((el) => el.textContent?.trim().toLowerCase() === lower)
              || btns.find((el) => el.textContent?.trim().toLowerCase().includes(lower));
        if (b) {
          b.click();
          return true;
        }
        return false;
      }, s.tab);
      if (!clicked) results.push(`${s.id}: tab "${s.tab}" not found`);
      await new Promise((r) => setTimeout(r, 1200));
    }

    if (s.settings) {
      const opened = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')];
        const settingsBtn = btns.find((b) => b.getAttribute('aria-label')?.toLowerCase().includes('settings') || b.title?.toLowerCase().includes('settings'));
        if (settingsBtn) {
          settingsBtn.click();
          return true;
        }
        return false;
      });
      if (!opened) results.push(`${s.id}: settings button not found`);
      await new Promise((r) => setTimeout(r, 1200));
    }

    if (s.map) {
      const opened = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')];
        const mapBtn = btns.find((b) => b.textContent?.trim().toLowerCase() === 'map' || b.getAttribute('aria-label')?.toLowerCase() === 'map');
        if (mapBtn) {
          mapBtn.click();
          return true;
        }
        return false;
      });
      if (!opened) results.push(`${s.id}: map button not found`);
      await new Promise((r) => setTimeout(r, 1500));
    }

    // Probe for empty-state testid
    const probe = await page.evaluate(() => {
      const els = [...document.querySelectorAll('[data-testid*="empty-state"]')];
      return els.map((e) => ({
        testid: e.getAttribute('data-testid'),
        text: (e.textContent || '').trim().slice(0, 200),
      }));
    });

    const outFile = join(outDir, `${s.id}.png`);
    await page.screenshot({ path: outFile, fullPage: false });
    results.push(`${s.id}: OK | empty-state: ${JSON.stringify(probe)}`);
  } catch (err) {
    results.push(`${s.id}: ERROR ${err.message}`);
  }
}

console.log(results.join('\n'));
await browser.close();
