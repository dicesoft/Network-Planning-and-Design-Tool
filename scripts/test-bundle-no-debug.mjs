#!/usr/bin/env node
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distAssets = resolve(__dirname, '..', 'dist', 'assets');

const FORBIDDEN = ['Debug Dashboard'];

if (!existsSync(distAssets)) {
  console.error(`[test-bundle-no-debug] dist/assets not found at ${distAssets}. Run 'npm run build' first.`);
  process.exit(2);
}

const files = readdirSync(distAssets).filter((f) => f.endsWith('.js'));
if (files.length === 0) {
  console.error('[test-bundle-no-debug] no .js files found in dist/assets');
  process.exit(2);
}

const offenders = [];
for (const file of files) {
  const full = join(distAssets, file);
  const content = readFileSync(full, 'utf8');
  for (const needle of FORBIDDEN) {
    if (content.includes(needle)) {
      offenders.push({ file, needle });
    }
  }
}

if (offenders.length > 0) {
  console.error('[test-bundle-no-debug] FAIL — debug surfaces leaked into prod bundle:');
  for (const o of offenders) {
    console.error(`  ${o.file}: contains "${o.needle}"`);
  }
  process.exit(1);
}

console.log(`[test-bundle-no-debug] OK — scanned ${files.length} bundle file(s); no debug strings found.`);
process.exit(0);
