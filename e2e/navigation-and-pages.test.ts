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
} from './helpers';

describe('Navigation & Pages E2E Tests', () => {
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

  // ---------- Header Navigation ----------

  describe('Header Navigation', () => {
    it('should navigate to Services page', async () => {
      await navigateTo(page, 'services');
      await waitForTestId(page, 'services-page');
      const text = await page.$eval('[data-testid="services-page"]', (el) => el.textContent);
      expect(text).toContain('Services');
    });

    it('should navigate to Capacity page', async () => {
      await navigateTo(page, 'capacity');
      await waitForTestId(page, 'capacity-page');
      const text = await page.$eval('[data-testid="capacity-page"]', (el) => el.textContent);
      expect(text).toContain('Capacity');
    });

    it('should navigate to Simulation page', async () => {
      await navigateTo(page, 'simulation');
      await waitForTestId(page, 'simulation-page');
      const text = await page.$eval('[data-testid="simulation-page"]', (el) => el.textContent);
      expect(text).toContain('Simulation');
    });

    it('should navigate to Reports page', async () => {
      await navigateTo(page, 'reports');
      await waitForTestId(page, 'reports-page');
      const text = await page.$eval('[data-testid="reports-page"]', (el) => el.textContent);
      expect(text).toContain('Reports');
    });

    it('should navigate to Tools page', async () => {
      await navigateTo(page, 'tools');
      await waitForTestId(page, 'tools-page');
      const text = await page.$eval('[data-testid="tools-page"]', (el) => el.textContent);
      expect(text).toContain('Tools');
    });

    it('should navigate back to Topology page', async () => {
      // Go to services first
      await navigateTo(page, 'services');
      await waitForTestId(page, 'services-page');

      // Navigate back to topology
      await navigateTo(page, 'topology');
      await page.waitForSelector('[data-testid="canvas"]', { timeout: 10000 });
      const canvas = await page.$('[data-testid="canvas"]');
      expect(canvas).not.toBeNull();
    });
  });

  // ---------- Theme Toggle ----------

  describe('Theme Toggle', () => {
    it('should toggle theme class on html element', async () => {
      const getThemeClass = async () => {
        return page.$eval('html', (el) => el.classList.contains('dark'));
      };

      const wasDark = await getThemeClass();

      // Click theme toggle
      const toggle = await page.$('[data-testid="theme-toggle"]');
      expect(toggle).not.toBeNull();
      await toggle!.click();
      await delay(300);

      const isDark = await getThemeClass();
      expect(isDark).not.toBe(wasDark);
    });
  });

  // ---------- Settings Dialog ----------

  describe('Settings Dialog', () => {
    it('should open and close settings dialog', async () => {
      // Open settings
      const settingsBtn = await page.$('[data-testid="settings-button"]');
      expect(settingsBtn).not.toBeNull();
      await settingsBtn!.click();
      await delay(300);

      // Assert dialog appears
      await waitForTestId(page, 'settings-dialog');
      const dialog = await page.$('[data-testid="settings-dialog"]');
      expect(dialog).not.toBeNull();

      // Close via Escape key (no unsaved changes, so it should close directly)
      await page.keyboard.press('Escape');
      await delay(500);

      // Dialog should be gone
      const dialogAfter = await page.$('[data-testid="settings-dialog"]');
      expect(dialogAfter).toBeNull();
    });

    it('should switch between settings tabs', async () => {
      // Open settings
      const settingsBtn = await page.$('[data-testid="settings-button"]');
      await settingsBtn!.click();
      await delay(300);
      await waitForTestId(page, 'settings-dialog');

      // Click Canvas tab
      const canvasTab = await page.$('[data-testid="settings-tab-canvas"]');
      expect(canvasTab).not.toBeNull();
      await canvasTab!.click();
      await delay(200);

      // Verify Canvas tab is selected (aria-selected)
      const isSelected = await canvasTab!.evaluate(
        (el) => el.getAttribute('aria-selected')
      );
      expect(isSelected).toBe('true');

      // Click Network tab
      const networkTab = await page.$('[data-testid="settings-tab-network"]');
      expect(networkTab).not.toBeNull();
      await networkTab!.click();
      await delay(200);

      const networkSelected = await networkTab!.evaluate(
        (el) => el.getAttribute('aria-selected')
      );
      expect(networkSelected).toBe('true');
    });
  });

  // ---------- Wiki/Help Modal ----------

  describe('Wiki/Help Modal', () => {
    it('should open and close wiki modal', async () => {
      // Click wiki button
      const wikiBtn = await page.$('[data-testid="wiki-button"]');
      expect(wikiBtn).not.toBeNull();
      await wikiBtn!.click();
      await delay(500);

      // Assert a dialog appeared (wiki modal)
      const dialog = await page.$('[role="dialog"]');
      expect(dialog).not.toBeNull();

      // Close with Escape
      await page.keyboard.press('Escape');
      await delay(300);

      // Dialog should be closed
      const dialogAfter = await page.$('[role="dialog"]');
      expect(dialogAfter).toBeNull();
    });
  });

  // ---------- Active Nav Highlight ----------

  describe('Active Nav Highlight', () => {
    it('should highlight the active nav tab', async () => {
      // Navigate to Services
      await navigateTo(page, 'services');
      await waitForTestId(page, 'services-page');

      // Check services nav has active styling (bg-primary)
      const servicesNavClasses = await page.$eval(
        '[data-testid="nav-services"]',
        (el) => el.className
      );
      expect(servicesNavClasses).toContain('bg-primary');

      // Check topology nav does NOT have active styling
      const topologyNavClasses = await page.$eval(
        '[data-testid="nav-topology"]',
        (el) => el.className
      );
      expect(topologyNavClasses).not.toContain('bg-primary');
    });
  });
});
