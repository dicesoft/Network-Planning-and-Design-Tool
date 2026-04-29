import { ChildProcess, spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

let serverProcess: ChildProcess | null = null;
let usingExistingServer = false;

const PRIMARY_PORT = 3000;
const FALLBACK_PORT = 3099;

/** File used to communicate the actual port from globalSetup to test workers */
const PORT_FILE = path.join(__dirname, 'artifacts', '.e2e-port');

/** Check if a URL responds with 200 */
function checkServer(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    http
      .get(url, (res) => {
        res.resume(); // consume response to free memory
        resolve(res.statusCode === 200);
      })
      .on('error', () => resolve(false));
  });
}

/**
 * Fetch the response body from a URL and check if it belongs to
 * the ATLAS Network Planning Tool (Vite-served SPA).
 * We look for the Vite client script or the "ATLAS" title which
 * are unique to our app, vs. other servers (e.g. Next.js / Langfuse).
 */
function checkIsAtlasServer(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    http
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve(false);
          return;
        }
        let body = '';
        res.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });
        res.on('end', () => {
          // Vite injects /@vite/client or src/main.tsx; our index.html has id="root"
          const isVite = body.includes('@vite/client') || body.includes('src/main.tsx');
          const isAtlas = body.includes('ATLAS') || body.includes('id="root"');
          resolve(isVite || isAtlas);
        });
      })
      .on('error', () => resolve(false));
  });
}

function waitForServer(url: string, timeoutMs = 30000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Server at ${url} did not respond within ${timeoutMs}ms`));
        return;
      }
      http
        .get(url, (res) => {
          res.resume();
          if (res.statusCode === 200) {
            resolve();
          } else {
            setTimeout(check, 500);
          }
        })
        .on('error', () => {
          setTimeout(check, 500);
        });
    };
    check();
  });
}

function startVite(port: number): ChildProcess {
  const child = spawn('npx', ['vite', '--port', String(port), '--strictPort'], {
    stdio: 'pipe',
    shell: true,
    cwd: process.cwd(),
  });

  child.stdout?.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) console.log(`[vite] ${msg}`);
  });

  child.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) console.error(`[vite:err] ${msg}`);
  });

  child.on('error', (err) => {
    console.error('[globalSetup] Failed to start Vite:', err);
  });

  return child;
}

/** Write the resolved port to a file so test workers can read it */
function writePortFile(port: number) {
  const dir = path.dirname(PORT_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PORT_FILE, String(port), 'utf-8');
}

export async function setup() {
  // Skip server start if TEST_URL is set (Docker/CI with external server)
  if (process.env.TEST_URL) {
    console.log(`[globalSetup] Using external server: ${process.env.TEST_URL}`);
    return;
  }

  const primaryUrl = `http://localhost:${PRIMARY_PORT}`;

  // Check if a server is already running on the primary port
  const alreadyRunning = await checkServer(primaryUrl);
  if (alreadyRunning) {
    // Validate it's actually our ATLAS app, not a foreign server
    const isAtlas = await checkIsAtlasServer(primaryUrl);
    if (isAtlas) {
      console.log(`[globalSetup] ATLAS dev server already running on port ${PRIMARY_PORT} — reusing it.`);
      usingExistingServer = true;
      writePortFile(PRIMARY_PORT);
      return;
    }
    // Port occupied by a different app — use fallback port
    console.log(
      `[globalSetup] Port ${PRIMARY_PORT} is occupied by a non-ATLAS server. ` +
      `Starting Vite on fallback port ${FALLBACK_PORT}...`
    );
    serverProcess = startVite(FALLBACK_PORT);
    const fallbackUrl = `http://localhost:${FALLBACK_PORT}`;
    await waitForServer(fallbackUrl);
    writePortFile(FALLBACK_PORT);
    console.log(`[globalSetup] Vite dev server is ready on port ${FALLBACK_PORT}.`);
    return;
  }

  // No server on primary port — start one
  console.log(`[globalSetup] Starting Vite dev server on port ${PRIMARY_PORT}...`);
  serverProcess = startVite(PRIMARY_PORT);
  await waitForServer(primaryUrl);
  writePortFile(PRIMARY_PORT);
  console.log('[globalSetup] Vite dev server is ready.');
}

export async function teardown() {
  // Clean up port file
  try { fs.unlinkSync(PORT_FILE); } catch { /* ignore */ }

  if (usingExistingServer) {
    console.log('[globalSetup] Reused existing server — not stopping it.');
    return;
  }
  if (serverProcess) {
    console.log('[globalSetup] Stopping Vite dev server...');
    // On Windows, we need to kill the process tree
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(serverProcess.pid), '/f', '/t'], { shell: true });
    } else {
      serverProcess.kill('SIGTERM');
    }
    serverProcess = null;
    console.log('[globalSetup] Vite dev server stopped.');
  }
}
