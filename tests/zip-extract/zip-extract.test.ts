import { describe, expect, it } from 'vitest';
import {
  ArchiveKitError,
  createZip,
  extractZip,
  extractZipEntry,
  getZipMetadata,
  isZipArchive,
  isZipArchiveSync,
  listZipEntries,
  validateZipArchive
} from '../../src/index.js';

describe('ZIP Extraction utility', () => {
  it('extracts all entries from a valid ZIP archive', async () => {
    const zipData = await createZip([
      { path: 'test.txt', data: 'Hello Zip Extract!' },
      { path: 'folder/inner.json', data: '{"active":true}' }
    ]);

    const result = await extractZip(zipData);
    expect(result.totalFiles).toBe(2);
    expect(result.entries).toHaveLength(2);

    const testFile = result.entries.find((e) => e.path === 'test.txt');
    expect(testFile).toBeDefined();
    expect(testFile?.text()).toBe('Hello Zip Extract!');
    expect(testFile?.blob('text/plain')).toBeInstanceOf(Blob);

    const innerFile = result.entries.find((e) => e.path === 'folder/inner.json');
    expect(innerFile?.text()).toBe('{"active":true}');
  });

  it('extracts selective entry without decompressing others (extractZipEntry)', async () => {
    const zipData = await createZip([
      { path: 'skip1.txt', data: 'skip 1' },
      { path: 'target.txt', data: 'Target Extracted Content!' },
      { path: 'skip2.txt', data: 'skip 2' }
    ]);

    const entry = await extractZipEntry(zipData, 'target.txt');
    expect(entry.path).toBe('target.txt');
    expect(entry.text()).toBe('Target Extracted Content!');
    expect(entry.uncompressedSize).toBe(25);
  });

  it('throws INVALID_INPUT when requested entry is not found', async () => {
    const zipData = await createZip([{ path: 'one.txt', data: 'one' }]);
    await expect(extractZipEntry(zipData, 'non-existent.txt')).rejects.toThrow(
      /was not found in the ZIP archive/
    );
  });

  it('supports filtered extraction via options.filter', async () => {
    const zipData = await createZip([
      { path: 'readme.md', data: '# Readme' },
      { path: 'src/index.ts', data: 'console.log(1)' },
      { path: 'src/test.ts', data: 'console.log(2)' }
    ]);

    const result = await extractZip(zipData, {
      filter: (e) => e.path.startsWith('src/')
    });

    expect(result.entries).toHaveLength(2);
    expect(result.entries.map((e) => e.path)).toEqual(['src/index.ts', 'src/test.ts']);
  });

  it('handles empty files inside archives correctly', async () => {
    const zipData = await createZip([
      { path: 'empty.txt', data: new Uint8Array(0) }
    ]);

    const result = await extractZip(zipData);
    expect(result.entries[0]?.uncompressedSize).toBe(0);
    expect(result.entries[0]?.data.length).toBe(0);
  });

  it('handles empty archives correctly', async () => {
    const zipData = await createZip([]);
    const result = await extractZip(zipData);
    expect(result.entries).toHaveLength(0);
    expect(result.totalFiles).toBe(0);
  });

  it('inspects metadata without decompression (listZipEntries)', async () => {
    const zipData = await createZip([
      { path: 'file1.txt', data: 'file 1 content' },
      { path: 'file2.txt', data: 'file 2 content' }
    ]);

    const entries = await listZipEntries(zipData);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.path).toBe('file1.txt');
    expect(entries[1]?.path).toBe('file2.txt');
    expect(entries[0]?.crc32).toBeDefined();
  });

  it('returns comprehensive archive metadata via getZipMetadata', async () => {
    const zipData = await createZip([
      { path: 'a.txt', data: 'A' },
      { path: 'b.txt', data: 'B' }
    ]);

    const metadata = await getZipMetadata(zipData);
    expect(metadata.isValid).toBe(true);
    expect(metadata.entryCount).toBe(2);
    expect(metadata.totalUncompressedSize).toBe(2);
    expect(metadata.hasEncryptedEntries).toBe(false);
  });

  it('validates archives thoroughly with validateZipArchive', async () => {
    const zipData = await createZip([
      { path: 'valid.txt', data: 'valid' }
    ]);

    const verdict = await validateZipArchive(zipData);
    expect(verdict.valid).toBe(true);
    expect(verdict.errors).toHaveLength(0);
    expect(verdict.entryCount).toBe(1);
  });

  it('detects invalid ZIP archives', async () => {
    const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(isZipArchiveSync(garbage)).toBe(false);
    expect(await isZipArchive(garbage)).toBe(false);

    await expect(extractZip(garbage)).rejects.toThrow(/not a valid ZIP archive/);
    const verdict = await validateZipArchive(garbage);
    expect(verdict.valid).toBe(false);
    expect(verdict.errors.length).toBeGreaterThan(0);
  });

  it('detects corrupted or truncated ZIP archives', async () => {
    const zipData = await createZip([{ path: 'test.txt', data: 'content' }]);
    const truncated = zipData.subarray(0, zipData.length - 15); // cut off EOCD
    await expect(extractZip(truncated)).rejects.toThrow(ArchiveKitError);
  });

  it('extracts STORE compressed entries and verifies CRC', async () => {
    const zipData = await createZip(
      [{ path: 'store-file.txt', data: 'Uncompressed store payload' }],
      { compression: 'store' }
    );

    const extracted = await extractZip(zipData);
    expect(extracted.entries[0]?.compressionMethod).toBe(0);
    expect(extracted.entries[0]?.text()).toBe('Uncompressed store payload');

    const single = await extractZipEntry(zipData, 'store-file.txt');
    expect(single.text()).toBe('Uncompressed store payload');
  });

  it('handles directory entries extraction properly', async () => {
    const zipData = await createZip([
      { path: 'empty-dir/', type: 'directory' },
      { path: 'empty-dir/child.txt', data: 'child' }
    ]);

    const extracted = await extractZip(zipData);
    expect(extracted.totalDirectories).toBe(1);
    expect(extracted.totalFiles).toBe(1);
    const dir = extracted.entries.find((e) => e.path === 'empty-dir/');
    expect(dir?.isDirectory).toBe(true);
    expect(dir?.data.length).toBe(0);
  });

  it('handles abort during extractZip operation', async () => {
    const zipData = await createZip([{ path: 'test.txt', data: 'content' }]);
    const controller = new AbortController();
    const promise = extractZip(zipData, { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toThrow(/aborted/);
  });
});
