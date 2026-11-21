import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

console.log('--- Starting Consumer Verification Pipeline ---');

// 1. Run build
console.log('Step 1: Building package...');
execSync('npm run build', { stdio: 'inherit' });

// 2. Pack tarball
console.log('Step 2: Packing npm tarball...');
const packOutput = execSync('npm pack --json --ignore-scripts', { encoding: 'utf8' });
const packInfo = JSON.parse(packOutput)[0];
const tarballName = packInfo.filename;
console.log(`Generated tarball: ${tarballName} (${packInfo.size} bytes, ${packInfo.entryCount} files)`);

const rootDir = process.cwd();
const tarballPath = path.resolve(rootDir, tarballName);

// 3. Create clean temp directory
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-kit-consumer-'));
console.log(`Step 3: Created temporary sandbox at: ${tempDir}`);

try {
  // 4. Initialize clean consumer project
  fs.writeFileSync(
    path.join(tempDir, 'package.json'),
    JSON.stringify(
      {
        name: 'consumer-test',
        version: '1.0.0',
        type: 'module',
        dependencies: {
          '@rahul_dadhich15/archive-kit': `file:${tarballPath}`
        },
        devDependencies: {
          typescript: '^5.7.2',
          '@types/node': '^22.10.1'
        }
      },
      null,
      2
    )
  );

  console.log('Step 4: Installing tarball in consumer sandbox...');
  execSync('npm install --ignore-scripts', { cwd: tempDir, stdio: 'inherit' });

  // 5. Test ESM consumer imports
  console.log('Step 5: Testing consumer ESM imports...');
  const esmTestScript = `
    import assert from 'node:assert';
    import { gzipCompressText, gzipDecompressText, createZip, extractZip } from '@rahul_dadhich15/archive-kit';
    import { gzipCompress } from '@rahul_dadhich15/archive-kit/gzip';
    import { createZipBlob } from '@rahul_dadhich15/archive-kit/zip-create';
    import { listZipEntries } from '@rahul_dadhich15/archive-kit/zip-extract';

    assert.strictEqual(typeof gzipCompressText, 'function');
    assert.strictEqual(typeof gzipCompress, 'function');
    assert.strictEqual(typeof createZipBlob, 'function');
    assert.strictEqual(typeof listZipEntries, 'function');

    const gz = await gzipCompressText('Hello Consumer ESM');
    const txt = await gzipDecompressText(gz);
    assert.strictEqual(txt, 'Hello Consumer ESM');

    const zip = await createZip([{ path: 'test.txt', data: 'Zip content' }]);
    const extracted = await extractZip(zip);
    assert.strictEqual(extracted.entries[0].text(), 'Zip content');

    console.log('✓ Consumer ESM imports and execution passed');
  `;
  fs.writeFileSync(path.join(tempDir, 'test-esm.mjs'), esmTestScript);
  execSync('node test-esm.mjs', { cwd: tempDir, stdio: 'inherit' });

  // 6. Test CommonJS consumer imports
  console.log('Step 6: Testing consumer CommonJS imports...');
  const cjsTestScript = `
    const assert = require('node:assert');
    const { gzipCompressTextSync, gzipDecompressTextSync, createZipSync } = require('@rahul_dadhich15/archive-kit');
    const { gzipCompressSync } = require('@rahul_dadhich15/archive-kit/gzip');
    const { createZip } = require('@rahul_dadhich15/archive-kit/zip-create');
    const { isZipArchiveSync } = require('@rahul_dadhich15/archive-kit/zip-extract');

    assert.strictEqual(typeof gzipCompressTextSync, 'function');
    assert.strictEqual(typeof gzipCompressSync, 'function');
    assert.strictEqual(typeof createZip, 'function');
    assert.strictEqual(typeof isZipArchiveSync, 'function');

    const gz = gzipCompressTextSync('Hello Consumer CJS');
    const txt = gzipDecompressTextSync(gz);
    assert.strictEqual(txt, 'Hello Consumer CJS');

    const zip = createZipSync([{ path: 'cjs.txt', data: 'CJS ZIP' }]);
    assert.strictEqual(isZipArchiveSync(zip), true);

    console.log('✓ Consumer CommonJS imports and execution passed');
  `;
  fs.writeFileSync(path.join(tempDir, 'test-cjs.cjs'), cjsTestScript);
  execSync('node test-cjs.cjs', { cwd: tempDir, stdio: 'inherit' });

  // 7. Test TypeScript declarations
  console.log('Step 7: Verifying TypeScript declarations in consumer...');
  fs.writeFileSync(
    path.join(tempDir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          noEmit: true
        },
        include: ['test-types.ts']
      },
      null,
      2
    )
  );

  const tsTestScript = `
    import {
      gzipCompress,
      gzipDecompress,
      createZip,
      extractZip,
      ZipInputEntry,
      ExtractedZipEntry,
      GzipMetadata
    } from '@rahul_dadhich15/archive-kit';

    import { GzipCompressOptions } from '@rahul_dadhich15/archive-kit/gzip';
    import { ZipCreateOptions } from '@rahul_dadhich15/archive-kit/zip-create';
    import { ZipEntryInfo } from '@rahul_dadhich15/archive-kit/zip-extract';

    const opts: GzipCompressOptions = { level: 6 };
    const createOpts: ZipCreateOptions = { compression: 'deflate' };
    const entry: ZipInputEntry = { path: 'file.txt', data: 'hello' };

    async function checkTypes(): Promise<void> {
      const compressed: Uint8Array = await gzipCompress(new Uint8Array([1, 2, 3]), opts);
      const decompressed: Uint8Array = await gzipDecompress(compressed);
      const zip: Uint8Array = await createZip([entry], createOpts);
      const result = await extractZip(zip);
      const firstEntry: ExtractedZipEntry | undefined = result.entries[0];
      const text: string | undefined = firstEntry?.text();
    }
  `;
  fs.writeFileSync(path.join(tempDir, 'test-types.ts'), tsTestScript);
  execSync('npx tsc --noEmit', { cwd: tempDir, stdio: 'inherit' });
  console.log('✓ TypeScript declarations typecheck passed in consumer');

  console.log('--- Consumer Verification Pipeline Completed Successfully ---');
} finally {
  // Cleanup
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (fs.existsSync(tarballPath)) {
      fs.unlinkSync(tarballPath);
    }
  } catch {}
}
