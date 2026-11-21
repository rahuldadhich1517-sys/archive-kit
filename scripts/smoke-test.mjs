import assert from 'node:assert';
import { createRequire } from 'node:module';
import * as RootEsm from '../dist/index.js';
import * as GzipEsm from '../dist/gzip/index.js';
import * as ZipCreateEsm from '../dist/zip-create/index.js';
import * as ZipExtractEsm from '../dist/zip-extract/index.js';

console.log('--- Running Smoke Tests on Built Artifacts ---');

// 1. Verify ESM Root exports
assert.strictEqual(typeof RootEsm.gzipCompress, 'function', 'RootEsm.gzipCompress must be a function');
assert.strictEqual(typeof RootEsm.createZip, 'function', 'RootEsm.createZip must be a function');
assert.strictEqual(typeof RootEsm.extractZip, 'function', 'RootEsm.extractZip must be a function');
assert.strictEqual(typeof RootEsm.listZipEntries, 'function', 'RootEsm.listZipEntries must be a function');
console.log('✓ ESM root exports verified');

// 2. Verify ESM Subpath exports
assert.strictEqual(typeof GzipEsm.gzipCompress, 'function', 'GzipEsm.gzipCompress must be a function');
assert.strictEqual(typeof ZipCreateEsm.createZip, 'function', 'ZipCreateEsm.createZip must be a function');
assert.strictEqual(typeof ZipExtractEsm.extractZip, 'function', 'ZipExtractEsm.extractZip must be a function');
console.log('✓ ESM subpath exports verified (/gzip, /zip-create, /zip-extract)');

// 3. Verify CommonJS exports via createRequire
const require = createRequire(import.meta.url);
const RootCjs = require('../dist/index.cjs');
const GzipCjs = require('../dist/gzip/index.cjs');
const ZipCreateCjs = require('../dist/zip-create/index.cjs');
const ZipExtractCjs = require('../dist/zip-extract/index.cjs');

assert.strictEqual(typeof RootCjs.gzipCompress, 'function', 'RootCjs.gzipCompress must be a function');
assert.strictEqual(typeof RootCjs.createZip, 'function', 'RootCjs.createZip must be a function');
assert.strictEqual(typeof RootCjs.extractZip, 'function', 'RootCjs.extractZip must be a function');

assert.strictEqual(typeof GzipCjs.gzipCompress, 'function', 'GzipCjs.gzipCompress must be a function');
assert.strictEqual(typeof ZipCreateCjs.createZip, 'function', 'ZipCreateCjs.createZip must be a function');
assert.strictEqual(typeof ZipExtractCjs.extractZip, 'function', 'ZipExtractCjs.extractZip must be a function');
console.log('✓ CommonJS root and subpaths verified');

// 4. End-to-end representative execution with built artifacts
async function runSmokeE2E() {
  // GZIP
  const testText = 'ArchiveKit Smoke Test Payload';
  const compressedGzip = await RootEsm.gzipCompressText(testText);
  const decompressedGzip = await RootEsm.gzipDecompressText(compressedGzip);
  assert.strictEqual(decompressedGzip, testText, 'GZIP roundtrip must match');
  console.log('✓ Built artifact GZIP end-to-end operational');

  // ZIP
  const zipData = await RootEsm.createZip([
    { path: 'smoke.txt', data: 'Smoke Test Content' },
    { path: 'sub/nested.txt', data: 'Nested content' }
  ]);
  const extracted = await RootEsm.extractZip(zipData);
  assert.strictEqual(extracted.totalFiles, 2, 'Must extract 2 files');
  assert.strictEqual(extracted.entries[0]?.text(), 'Smoke Test Content');
  console.log('✓ Built artifact ZIP create and extract operational');
}

await runSmokeE2E();
console.log('--- All Smoke Tests Passed Successfully ---');
