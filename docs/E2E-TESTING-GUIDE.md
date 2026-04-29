# E2E Testing Guide

A self-contained reference for writing, running, and debugging end-to-end tests in the ATLAS Network Planning Tool.

## 1. Overview

E2E tests verify complete user workflows in a real browser using **Puppeteer** + **Vitest**. They complement unit tests by catching integration issues, rendering bugs, and regressions in the full application stack.

**When to write E2E tests:**
- New pages or navigation flows
- Complex multi-step interactions (node CRUD, service wizard)
- Regressions that only manifest in the browser (e.g., infinite loops, canvas crashes)
- Import/export and persistence workflows

**When to prefer unit tests:**
- Pure logic (store actions, algorithms, validators)
- Isolated component rendering
- Functions with no browser/DOM dependencies

## 2. Quick Start

### Run all E2E tests

```bash
npm run test:e2e
```

This starts the Vite dev server automatically (or reuses one already running on port 3000), then runs all `e2e/**/*.test.ts` files.

### Run a single test file

```bash
npx vitest run --config vitest.e2e.config.ts e2e/navigation-and-pages.test.ts
```

### Run a single test by name

```bash
npx vitest run --config vitest.e2e.config.ts -t "should navigate to Services page"
```

### Run with a pre-started server

If you already have `npm run dev` running:

```bash
npx vitest run --config vitest.e2e.config.ts
```

The global setup detects an existing server on port 3000 and skips starting a new one.

### Run against a custom URL (Docker, CI)

```bash
TEST_URL=http://localhost:8080 npx vitest run --config vitest.e2e.config.ts
```

## 3. Writing a New Test

### File template

Create a new file in `e2e/` with the `.test.ts` extension:

```typescript
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
} from './helpers';

describe('My Feature E2E Tests', () => {
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

  it('should do something', async () => {
    // Your test logic here
    const element = await page.$('[data-testid="my-element"]');
    expect(element).not.toBeNull();
  });
});
```

### Key points

- **One browser per describe block** (shared via `beforeAll`/`afterAll`)
- **Fresh page per test** (created in `beforeEach`, closed in `afterEach`)
- **Auto-capture on failure**: screenshots and console logs are saved when a test fails
- **Console logs are always captured**: use `consoleLogs.getLogs()` for debugging

## 4. Available Helpers

All helpers are exported from `e2e/helpers.ts`.

| Helper | Signature | Purpose |
|--------|-----------|---------|
| `launchBrowser()` | `() => Promise<Browser>` | Launch headless Puppeteer browser |
| `createPage(browser)` | `(Browser) => Promise<Page>` | Create a new page with 1920x1080 viewport |
| `delay(ms)` | `(number) => Promise<void>` | Wait for a specified number of milliseconds |
| `captureScreenshot(page, name)` | `(Page, string) => Promise<string>` | Save screenshot, returns filepath |
| `captureConsoleLogs(page)` | `(Page) => { attach, getLogs }` | Capture browser console output |
| `writeArtifact(name, content)` | `(string, string) => string` | Write text file to artifacts dir |
| `navigateTo(page, route)` | `(Page, string) => Promise<void>` | Navigate via header nav link (e.g., `'services'`, `'topology'`) |
| `waitForTestId(page, testId, timeout?)` | `(Page, string, number?) => Promise<void>` | Wait for `[data-testid="..."]` element |
| `getNodeCount(page)` | `(Page) => Promise<number>` | Parse node count from status bar |
| `getEdgeCount(page)` | `(Page) => Promise<number>` | Parse edge count from status bar |
| `createTestNode(page, type?, name?)` | `(Page, string?, string?) => Promise<boolean>` | Create a node via add mode + canvas click |
| `clearTopologyState(page)` | `(Page) => Promise<void>` | Clear localStorage stores and reload |

## 5. Adding `data-testid` Attributes

### Convention

- Use **kebab-case**: `data-testid="node-inspector"`, `data-testid="services-page"`
- Prefix by feature area: `nav-`, `settings-tab-`, `node-type-`
- Keep names descriptive and unique within the page

### How to add

Add `data-testid="my-id"` directly to the JSX element:

```tsx
<h1 data-testid="services-page">Services</h1>
<button data-testid="theme-toggle" onClick={toggleTheme}>...</button>
```

For dynamically generated elements (loops), use template literals:

```tsx
{tabs.map((tab) => (
  <Link key={tab.id} data-testid={`nav-${tab.id}`} to={tab.path}>
    {tab.label}
  </Link>
))}
```

### Current data-testid inventory

| testid | Component | Purpose |
|--------|-----------|---------|
| `header` | Header.tsx | Main header bar |
| `nav-topology` | Header.tsx | Topology nav link |
| `nav-services` | Header.tsx | Services nav link |
| `nav-capacity` | Header.tsx | Capacity nav link |
| `nav-simulation` | Header.tsx | Simulation nav link |
| `nav-reports` | Header.tsx | Reports nav link |
| `nav-tools` | Header.tsx | Tools nav link |
| `nav-debug` | Header.tsx | Debug page link |
| `theme-toggle` | Header.tsx | Theme toggle button |
| `settings-button` | Header.tsx | Settings dialog button |
| `wiki-button` | Header.tsx | Wiki/Help modal button |
| `settings-dialog` | SettingsDialog.tsx | Settings dialog content |
| `settings-tab-general` | SettingsDialog.tsx | General settings tab |
| `settings-tab-canvas` | SettingsDialog.tsx | Canvas settings tab |
| `settings-tab-network` | SettingsDialog.tsx | Network settings tab |
| `settings-tab-simulation` | SettingsDialog.tsx | Simulation settings tab |
| `settings-tab-advanced` | SettingsDialog.tsx | Advanced settings tab |
| `services-page` | ServicesPage.tsx | Services page heading |
| `capacity-page` | CapacityPage.tsx | Capacity page heading |
| `simulation-page` | SimulationPage.tsx | Simulation page heading |
| `reports-page` | ReportsPage.tsx | Reports page heading |
| `tools-page` | ToolsPage.tsx | Tools page heading |
| `canvas` | Canvas.tsx | React Flow canvas |
| `sidebar` | Sidebar.tsx | Left sidebar |
| `toolbar` | Toolbar.tsx | Canvas toolbar |
| `status-bar` | StatusBar.tsx | Bottom status bar |
| `node-palette` | NodePalette.tsx | Node type palette |
| `node-inspector` | NodeInspector.tsx | Node properties panel |
| `add-node-modal` | AddNodeModal.tsx | Add node dialog content |
| `add-node-confirm` | AddNodeModal.tsx | Confirm "Add Node" button |
| `node-type-{type}` | AddNodeModal.tsx | Node type selection buttons |
| `node-name-input` | AddNodeModal.tsx | Node name text input |
| `settings-apply-btn` | SettingsDialog.tsx | Settings Apply button |
| `settings-discard-btn` | SettingsDialog.tsx | Settings Discard button |
| `settings-changes-summary` | SettingsDialog.tsx | Change summary panel |
| `settings-unsaved-dialog` | SettingsDialog.tsx | Unsaved changes confirmation |
| `settings-discard-confirm-btn` | SettingsDialog.tsx | Confirm discard button |
| `osnr-analysis-panel` | OsnrAnalysisPanel.tsx | OSNR link budget panel |
| `osnr-gauge` | OsnrAnalysisPanel.tsx | OSNR margin gauge |
| `inventory-tab` | InventoryTab.tsx | Inventory tab in inspector |
| `inventory-add-card-btn` | InventoryTab.tsx | Add card button |
| `export-services-dropdown` | ServicesPage.tsx | Consolidated export dropdown |

## 6. Common Patterns

### Wait for an element

```typescript
await page.waitForSelector('[data-testid="my-element"]', { timeout: 10000 });
// or use the helper:
await waitForTestId(page, 'my-element');
```

### Click an element

```typescript
const button = await page.$('[data-testid="my-button"]');
await button!.click();
await delay(300);
```

### Type text into an input

```typescript
const input = await page.$('input[type="text"]');
await input!.click({ count: 3 }); // Select all
await page.keyboard.type('New value');
```

### Read element text

```typescript
const text = await page.$eval('[data-testid="status-bar"]', (el) => el.textContent);
expect(text).toContain('Nodes:');
```

### Keyboard shortcuts

```typescript
// Single key
await page.keyboard.press('n');

// Modifier combos
await page.keyboard.down('Control');
await page.keyboard.press('z');
await page.keyboard.up('Control');

// Shift+key (e.g., ? = Shift+/)
await page.keyboard.down('Shift');
await page.keyboard.press('/');
await page.keyboard.up('Shift');
```

### Navigate between pages

```typescript
await navigateTo(page, 'services');
await waitForTestId(page, 'services-page');
```

### Assert status bar counts

```typescript
const nodes = await getNodeCount(page);
expect(nodes).toBe(3);

const edges = await getEdgeCount(page);
expect(edges).toBe(2);
```

### Interact with modals

```typescript
// Wait for dialog to appear
const dialog = await page.$('[role="dialog"]');
expect(dialog).not.toBeNull();

// Find buttons by text content
const buttons = await dialog!.$$('button');
for (const btn of buttons) {
  const text = await btn.evaluate((el) => el.textContent);
  if (text?.includes('Confirm')) {
    await btn.click();
    break;
  }
}

// Close with Escape
await page.keyboard.press('Escape');
```

### Clean slate for tests

```typescript
beforeEach(async () => {
  page = await createPage(browser);
  consoleLogs = captureConsoleLogs(page);
  consoleLogs.attach();
  await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="canvas"]', { timeout: 10000 });
  await clearTopologyState(page); // Remove stored data, reload
});
```

## 7. Capturing & Reading Screenshots

### Automatic capture on failure

The `afterEach` block automatically captures a screenshot and console log when a test fails. Files are saved to:

```
e2e/artifacts/
  screenshots/   # PNG screenshots
  logs/          # Console log text files
  reports/       # Other artifacts
```

### Manual capture

```typescript
const filepath = await captureScreenshot(page, 'my-debug-screenshot');
console.log('Screenshot saved:', filepath);
```

### Reading screenshots with Claude

When debugging a failing test, Claude can read the screenshot directly:

```
Read tool with file_path: "D:\DiceSoft\Projects\Network-Planning-and-Design-Tool\e2e\artifacts\screenshots\my-test-2026-02-09T12-00-00-000Z.png"
```

## 8. Troubleshooting

### Timeout waiting for selector

**Symptom:** `TimeoutError: Waiting for selector '[data-testid="canvas"]' timed out`

**Causes & fixes:**
1. Dev server not running: check that port 3000 is responding
2. Element doesn't exist: verify the `data-testid` is correct and the component renders
3. Slow load: increase timeout to 15000 or 20000
4. Wrong page: use `navigateTo()` to ensure you're on the right page first

### Flaky tests

**Common causes:**
- Missing `await delay()` after actions that trigger re-renders
- Race conditions between UI updates and assertions
- Tests depending on state from previous tests (use `clearTopologyState`)

**Fixes:**
- Add `delay(300-500)` after clicks and keyboard actions
- Use `waitForSelector` instead of immediate assertions
- Use `clearTopologyState(page)` in `beforeEach` for state isolation

### Server issues

- **Port already in use**: another dev server is running; the global setup will reuse it
- **Server didn't start**: check `globalSetup.ts` console output, ensure `npm run dev` works manually
- **Windows process cleanup**: if the server hangs, use `taskkill /f /im node.exe` (be careful with other Node processes)

### Modal issues

- **Modal doesn't appear**: add more delay, check if the modal trigger works manually
- **Can't find buttons in modal**: use `page.$$('[role="dialog"] button')` to enumerate all buttons
- **Modal blocks interaction**: close modals with `page.keyboard.press('Escape')` before proceeding

### Canvas click issues

- **Click doesn't register**: canvas uses React Flow which may need clicks in specific regions
- **Node not created**: check if a modal appeared (node type selection) that needs confirmation
- **Wrong coordinates**: use `canvas.boundingBox()` to get accurate canvas position

## 9. File Organization

```
e2e/
  artifacts/                    # Generated on test runs (gitignored)
    screenshots/                # PNG screenshots (auto on failure)
    logs/                       # Console log captures
    reports/                    # Other artifacts
  globalSetup.ts                # Starts/reuses Vite dev server
  helpers.ts                    # Shared utilities and helpers
  debug-page.test.ts            # Debug page tests (6 tests)
  topology-workflow.test.ts     # Topology canvas tests (14 tests)
  navigation-and-pages.test.ts  # Page navigation, theme, settings (11 tests)
  node-crud.test.ts             # Node create, inspect, delete (11 tests)
  import-export.test.ts         # Import/export and persistence (7 tests)
  sprint-features.test.ts       # Sprint 2 features: display modes, tool palette, settings (16 tests)
  sprint-3-fixes.test.ts        # Sprint 3 fixes: view switch, inspector, path colors (8 tests)

vitest.e2e.config.ts            # E2E-specific Vitest configuration
```

### Test count summary

| File | Tests | Coverage Area |
|------|-------|--------------|
| `topology-workflow.test.ts` | 14 | Canvas, tool modes, status bar, undo, box-selection, geo view, shortcuts |
| `debug-page.test.ts` | 6 | Event log, state inspector, debug navigation, persistence |
| `navigation-and-pages.test.ts` | 11 | Page nav, theme toggle, settings dialog, wiki modal, active nav |
| `node-crud.test.ts` | 11 | Node creation, selection, inspection, deletion, keyboard shortcuts |
| `import-export.test.ts` | 7 | Export modal, import, localStorage persistence |
| `sprint-features.test.ts` | 16 | Reset network, display modes, tool palette, service export, settings |
| `sprint-3-fixes.test.ts` | 8 | View switch with selection, inspector positioning, path color consistency |
| **Total** | **73** | |

## 10. Live App Testing with Browser MCP

E2E tests (Sections 1-9) run headless Puppeteer scripts against the dev server. For **interactive live app testing** — where a Claude Code agent drives a real browser session, takes screenshots, checks the console, and inspects network requests — see:

**[Browser MCP Agent Guide](./browser-mcp-agent-guide.md)** — Puppeteer MCP and Chrome DevTools MCP setup, verification, and usage patterns.

Use this when you need to:
- Visually verify UI rendering, layout, or theme behavior
- Debug runtime issues via console errors and network requests interactively
- Test user workflows step-by-step with screenshot evidence
- Validate fixes in a running app before writing formal E2E test scripts

## 11. Sprint 4 Test Patterns

### Settings Apply/Discard Flow

```typescript
it('should not apply changes until Apply is clicked', async () => {
  // Open settings
  await page.click('[data-testid="settings-button"]');
  await waitForTestId(page, 'settings-dialog');

  // Change a setting
  // ... modify a value

  // Verify change summary appears
  const summary = await page.$('[data-testid="settings-changes-summary"]');
  expect(summary).not.toBeNull();

  // Click Apply
  await page.click('[data-testid="settings-apply-btn"]');
  await delay(300);

  // Verify change was applied
});

it('should show unsaved changes dialog on close', async () => {
  // Open settings, make a change, press Escape
  // Wait for unsaved dialog
  await waitForTestId(page, 'settings-unsaved-dialog');
  // Click discard
  await page.click('[data-testid="settings-discard-confirm-btn"]');
});
```

### OSNR Analysis Panel

```typescript
it('should display OSNR analysis in service wizard', async () => {
  // Navigate to Services, open wizard, configure L1 service
  // After path computation, check for OSNR panel
  await waitForTestId(page, 'osnr-analysis-panel');
  const gauge = await page.$('[data-testid="osnr-gauge"]');
  expect(gauge).not.toBeNull();
});
```

### Inventory Tab

```typescript
it('should display inventory tab in node inspector', async () => {
  // Create a node, select it, open inspector
  // Click inventory tab
  await waitForTestId(page, 'inventory-tab');
  const addBtn = await page.$('[data-testid="inventory-add-card-btn"]');
  expect(addBtn).not.toBeNull();
});
```

### Export Dropdown (Consolidated)

```typescript
it('should have single export dropdown on services page', async () => {
  await navigateTo(page, 'services');
  await waitForTestId(page, 'services-page');
  const dropdown = await page.$('[data-testid="export-services-dropdown"]');
  expect(dropdown).not.toBeNull();
  // Should have both JSON and CSV options
});
```
