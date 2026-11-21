import { describe, expect, it } from 'vitest';
import * as RootExports from '../../src/index.js';
import * as GzipExports from '../../src/gzip/index.js';
import * as ZipCreateExports from '../../src/zip-create/index.js';
import * as ZipExtractExports from '../../src/zip-extract/index.js';

describe('Integration & Subpath Exports Interoperability', () => {
  it('exposes all gzip functions from /gzip subpath identically to root', () => {
    expect(GzipExports.gzipCompress).toBe(RootExports.gzipCompress);
    expect(GzipExports.gzipDecompress).toBe(RootExports.gzipDecompress);
    expect(GzipExports.gzipCompressText).toBe(RootExports.gzipCompressText);
    expect(GzipExports.gzipDecompressText).toBe(RootExports.gzipDecompressText);
    expect(GzipExports.isGzipData).toBe(RootExports.isGzipData);
    expect(GzipExports.getGzipMetadata).toBe(RootExports.getGzipMetadata);
  });

  it('exposes all zip-create functions from /zip-create subpath identically to root', () => {
    expect(ZipCreateExports.createZip).toBe(RootExports.createZip);
    expect(ZipCreateExports.createZipBlob).toBe(RootExports.createZipBlob);
    expect(ZipCreateExports.createZipFromFiles).toBe(RootExports.createZipFromFiles);
    expect(ZipCreateExports.validateZipEntries).toBe(RootExports.validateZipEntries);
    expect(ZipCreateExports.getZipCreateOptions).toBe(RootExports.getZipCreateOptions);
  });

  it('exposes all zip-extract functions from /zip-extract subpath identically to root', () => {
    expect(ZipExtractExports.listZipEntries).toBe(RootExports.listZipEntries);
    expect(ZipExtractExports.extractZip).toBe(RootExports.extractZip);
    expect(ZipExtractExports.extractZipEntry).toBe(RootExports.extractZipEntry);
    expect(ZipExtractExports.isZipArchive).toBe(RootExports.isZipArchive);
    expect(ZipExtractExports.validateZipArchive).toBe(RootExports.validateZipArchive);
    expect(ZipExtractExports.getZipMetadata).toBe(RootExports.getZipMetadata);
  });

  it('completes full end-to-end multi-file archive round-trip', async () => {
    const originalFiles = [
      { path: 'index.html', data: '<!DOCTYPE html><html><body><h1>Hello</h1></body></html>' },
      { path: 'style.css', data: 'body { margin: 0; padding: 20px; font-family: sans-serif; }' },
      { path: 'app.js', data: 'console.log("App initialized");' },
      { path: 'assets/data.json', data: JSON.stringify({ version: '1.0.0', ok: true }) }
    ];

    // 1. Create ZIP
    const zipBytes = await RootExports.createZip(originalFiles, {
      compressionLevel: 6,
      comment: 'Round-trip integration test archive'
    });

    // 2. Validate ZIP
    const validation = await RootExports.validateZipArchive(zipBytes);
    expect(validation.valid).toBe(true);
    expect(validation.entryCount).toBe(4);

    // 3. Inspect metadata
    const metadata = await RootExports.getZipMetadata(zipBytes);
    expect(metadata.entryCount).toBe(4);
    expect(metadata.comment).toBe('Round-trip integration test archive');

    // 4. Extract entries
    const extracted = await RootExports.extractZip(zipBytes);
    expect(extracted.totalFiles).toBe(4);

    for (const original of originalFiles) {
      const match = extracted.entries.find((e) => e.path === original.path);
      expect(match).toBeDefined();
      expect(match?.text()).toBe(original.data);
    }
  });

  it('completes GZIP compression round-trip on binary payload', async () => {
    const randomPayload = new Uint8Array(10_000);
    for (let i = 0; i < randomPayload.length; i++) {
      randomPayload[i] = (i * 37) % 256;
    }

    const compressed = await RootExports.gzipCompress(randomPayload, { level: 9 });
    const decompressed = await RootExports.gzipDecompress(compressed);

    expect(decompressed).toEqual(randomPayload);
  });
});
