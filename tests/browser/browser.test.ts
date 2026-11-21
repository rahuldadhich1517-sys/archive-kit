import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

test.describe('Real Browser Execution with Playwright', () => {
  let bundleScript: string;

  test.beforeAll(() => {
    const bundlePath = path.resolve('tests/browser/dist/index.global.js');
    bundleScript = fs.readFileSync(bundlePath, 'utf8');
  });

  test('executes GZIP compression and decompression in real browser', async ({ page }) => {
    await page.goto('about:blank');
    await page.addScriptTag({ content: bundleScript });

    const result = await page.evaluate(async () => {
      const kit = (window as any).ArchiveKit;
      const text = 'Hello from real Chromium browser!';
      const compressed = await kit.gzipCompressText(text);
      const decompressed = await kit.gzipDecompressText(compressed);

      // Test Blob APIs
      const blob = new Blob([text], { type: 'text/plain' });
      const gzipBlob = await kit.gzipCompressBlob(blob);
      const unzippedBlob = await kit.gzipDecompressBlob(gzipBlob);
      const recoveredText = await unzippedBlob.text();

      return {
        matched: decompressed === text,
        recoveredTextMatched: recoveredText === text,
        gzipBlobType: gzipBlob.type
      };
    });

    expect(result.matched).toBe(true);
    expect(result.recoveredTextMatched).toBe(true);
    expect(result.gzipBlobType).toBe('application/gzip');
  });

  test('creates ZIP archives from browser File objects and extracts them in browser', async ({
    page
  }) => {
    await page.goto('about:blank');
    await page.addScriptTag({ content: bundleScript });

    const result = await page.evaluate(async () => {
      const kit = (window as any).ArchiveKit;

      // Create real browser File objects
      const file1 = new File(['Browser file 1 content'], 'document.txt', {
        type: 'text/plain',
        lastModified: Date.now()
      });
      const file2 = new File(['{"ui":"react+vite"}'], 'config.json', {
        type: 'application/json',
        lastModified: Date.now()
      });

      // Create ZIP blob
      const zipBlob = await kit.createZipFromFiles([file1, file2]);

      // Verify download URL creation without errors
      const downloadUrl = URL.createObjectURL(zipBlob);
      URL.revokeObjectURL(downloadUrl);

      // Inspect entries without decompressing
      const entries = await kit.listZipEntries(zipBlob);

      // Extract ZIP in browser
      const extracted = await kit.extractZip(zipBlob);
      const docEntry = extracted.entries.find((e: any) => e.path === 'document.txt');
      const configEntry = extracted.entries.find((e: any) => e.path === 'config.json');

      return {
        blobType: zipBlob.type,
        blobSize: zipBlob.size,
        entryCount: entries.length,
        docText: docEntry ? docEntry.text() : null,
        configText: configEntry ? configEntry.text() : null,
        docBlobType: docEntry ? docEntry.blob('text/plain').type : null
      };
    });

    expect(result.blobType).toBe('application/zip');
    expect(result.blobSize).toBeGreaterThan(0);
    expect(result.entryCount).toBe(2);
    expect(result.docText).toBe('Browser file 1 content');
    expect(result.configText).toBe('{"ui":"react+vite"}');
    expect(result.docBlobType).toBe('text/plain');
  });

  test('enforces Zip Slip and security protections in browser', async ({ page }) => {
    await page.goto('about:blank');
    await page.addScriptTag({ content: bundleScript });

    const result = await page.evaluate(async () => {
      const kit = (window as any).ArchiveKit;
      let blockedZipSlip = false;

      try {
        await kit.createZip([{ path: '../../etc/passwd', data: 'malicious' }]);
      } catch (err: any) {
        if (err.code === 'INVALID_ARCHIVE_PATH') {
          blockedZipSlip = true;
        }
      }

      return { blockedZipSlip };
    });

    expect(result.blockedZipSlip).toBe(true);
  });
});
