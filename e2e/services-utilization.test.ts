import { Browser, Page } from 'puppeteer';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import {
  BASE_URL,
  launchBrowser,
  createPage,
  delay,
  captureScreenshot,
  captureConsoleLogs,
  clearTopologyState,
} from './helpers';

/**
 * P1.3 / FR-023 — utilization parity.
 *
 * The Services table "Utilization" column MUST display the same value as the
 * inspector for the same L1 service. Both surfaces source from
 * UnderlaySelector.getUnderlayUtilization().
 */

interface SeededIds {
  underlayId: string;
}

async function seedUtilizationFixture(page: Page): Promise<SeededIds> {
  return page.evaluate(() => {
    // @ts-expect-error — runtime access to globally bound stores
    const networkStore = window.__ATLAS_STORES__?.network ?? null;
    // @ts-expect-error
    const serviceStore = window.__ATLAS_STORES__?.service ?? null;
    if (!networkStore || !serviceStore) {
      throw new Error('ATLAS store debug bridge unavailable — cannot seed fixture');
    }

    const sourceNodeId = networkStore.getState().addNode({
      type: 'router',
      position: { x: 100, y: 100 },
    });
    const destinationNodeId = networkStore.getState().addNode({
      type: 'router',
      position: { x: 400, y: 100 },
    });

    const underlayId = 'L1-UTIL-001';
    const overlayA = 'L2-UTIL-A';
    const overlayB = 'L2-UTIL-B';
    const now = Date.now();

    serviceStore.setState((state: { services: unknown[] }) => ({
      services: [
        ...state.services,
        {
          id: underlayId,
          type: 'l1-dwdm',
          name: 'Util Underlay',
          status: 'active',
          sourceNodeId,
          destinationNodeId,
          dataRate: '100G',
          modulationType: 'DP-QPSK',
          channelWidth: '50GHz',
          wavelengthMode: 'continuous',
          protectionScheme: 'none',
          restorationEnabled: false,
          workingPath: {
            nodeIds: [sourceNodeId, destinationNodeId],
            edgeIds: [],
            totalDistance: 100,
            hopCount: 1,
            status: 'computed',
          },
          createdAt: now,
          modifiedAt: now,
        },
        {
          id: overlayA,
          type: 'l2-ethernet',
          name: 'Util Overlay A',
          status: 'active',
          sourceNodeId,
          destinationNodeId,
          dataRate: '25G',
          underlayServiceId: underlayId,
          createdAt: now,
          modifiedAt: now,
        },
        {
          id: overlayB,
          type: 'l2-ethernet',
          name: 'Util Overlay B',
          status: 'active',
          sourceNodeId,
          destinationNodeId,
          dataRate: '25G',
          underlayServiceId: underlayId,
          createdAt: now,
          modifiedAt: now,
        },
      ],
    }));

    return { underlayId };
  });
}

async function readTableUtilization(page: Page, serviceId: string): Promise<string> {
  return page.evaluate((id: string) => {
    const rows = Array.from(document.querySelectorAll('tr')) as HTMLTableRowElement[];
    for (const row of rows) {
      if ((row.textContent || '').includes(id)) {
        const cells = Array.from(row.querySelectorAll('td')) as HTMLElement[];
        // Utilization cell: search for one ending in '%'
        for (const c of cells) {
          const txt = (c.textContent || '').trim();
          if (/\d+%$/.test(txt)) return txt;
        }
      }
    }
    return '';
  }, serviceId);
}

async function readInspectorUtilization(page: Page): Promise<string> {
  return page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('*')) as HTMLElement[];
    for (const el of candidates) {
      const txt = (el.textContent || '').trim();
      // Inspector Utilization label is followed by a value with %
      if (/Utilization/i.test(txt) && /%/.test(txt) && txt.length < 200) {
        const match = txt.match(/(\d+)\s*%/);
        if (match) return `${match[1]}%`;
      }
    }
    return '';
  });
}

describe('Services Table / Inspector utilization parity (FR-023)', () => {
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
    }
    await page.close();
  });

  it('table utilization cell matches inspector utilization for the same L1 service', async () => {
    // Navigate to Services route FIRST, then seed. A `page.goto` is a full
    // browser reload which would wipe in-memory store state before the
    // persist debounce/IDB flush completes — so seeding must happen AFTER
    // the page is on /services so the in-memory store is what the table reads.
    await page.goto(`${BASE_URL}/services`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('[data-testid="services-page"]', { timeout: 10000 });

    const { underlayId } = await seedUtilizationFixture(page);
    await delay(500);

    const tableValue = await readTableUtilization(page, underlayId);
    expect(tableValue).toMatch(/^\d+%$/);

    // Open inspector by clicking the row
    await page.evaluate((id: string) => {
      const rows = Array.from(document.querySelectorAll('tr')) as HTMLTableRowElement[];
      for (const row of rows) {
        if ((row.textContent || '').includes(id)) {
          (row as HTMLElement).click();
          return;
        }
      }
    }, underlayId);
    await delay(400);

    const inspectorValue = await readInspectorUtilization(page);
    expect(inspectorValue).toMatch(/^\d+%$/);

    expect(tableValue).toBe(inspectorValue);
  });
});
