import { describe, expect, it } from 'vitest';
import {
  ArchiveKitError,
  createZip,
  createZipBlob,
  createZipFromFiles,
  createZipSync,
  getZipCreateOptions,
  listZipEntries,
  validateZipEntries
} from '../../src/index.js';

describe('ZIP Creation utility', () => {
  it('creates an archive with a single file', async () => {
    const zipBytes = await createZip([
      { path: 'hello.txt', data: 'Hello World!' }
    ]);

    expect(zipBytes).toBeInstanceOf(Uint8Array);
    expect(zipBytes.length).toBeGreaterThan(0);

    const entries = await listZipEntries(zipBytes);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.path).toBe('hello.txt');
    expect(entries[0]?.uncompressedSize).toBe(12);
  });

  it('creates an archive with multiple files and nested directories', async () => {
    const zipBytes = await createZip([
      { path: 'root.txt', data: 'root file' },
      { path: 'docs/guide.md', data: '# Guide' },
      { path: 'docs/images/', type: 'directory' }
    ]);

    const entries = await listZipEntries(zipBytes);
    expect(entries).toHaveLength(3);
    const paths = entries.map((e) => e.path);
    expect(paths).toContain('root.txt');
    expect(paths).toContain('docs/guide.md');
    expect(paths).toContain('docs/images/');
  });

  it('supports synchronous ZIP creation (createZipSync)', () => {
    const zipBytes = createZipSync([
      { path: 'sync.txt', data: 'Synchronous ZIP creation' }
    ]);
    expect(zipBytes).toBeInstanceOf(Uint8Array);
    expect(zipBytes.length).toBeGreaterThan(0);
  });

  it('handles empty archive correctly', async () => {
    const zipBytes = await createZip([]);
    expect(zipBytes.length).toBeGreaterThan(0);
    const entries = await listZipEntries(zipBytes);
    expect(entries).toHaveLength(0);
  });

  it('handles zero-byte files', async () => {
    const zipBytes = await createZip([
      { path: 'empty.txt', data: new Uint8Array(0) }
    ]);
    const entries = await listZipEntries(zipBytes);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.uncompressedSize).toBe(0);
  });

  it('supports Unicode and special character filenames', async () => {
    const zipBytes = await createZip([
      { path: '日本語/データ.json', data: '{"status":"ok"}' },
      { path: 'emojis_🎉/file_🚀.txt', data: 'rocket' }
    ]);

    const entries = await listZipEntries(zipBytes);
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.path)).toContain('日本語/データ.json');
    expect(entries.map((e) => e.path)).toContain('emojis_🎉/file_🚀.txt');
  });

  it('supports STORE mode (no compression) and DEFLATE mode', async () => {
    const content = 'Repeated content '.repeat(50);
    const storeZip = await createZip(
      [{ path: 'stored.txt', data: content }],
      { compression: 'store' }
    );
    const deflateZip = await createZip(
      [{ path: 'deflated.txt', data: content }],
      { compression: 'deflate', compressionLevel: 9 }
    );

    const storeEntries = await listZipEntries(storeZip);
    const deflateEntries = await listZipEntries(deflateZip);

    expect(storeEntries[0]?.compressionMethod).toBe(0); // STORE
    expect(deflateEntries[0]?.compressionMethod).toBe(8); // DEFLATE
    expect(deflateZip.length).toBeLessThan(storeZip.length);
  });

  it('rejects duplicate paths by default', async () => {
    await expect(
      createZip([
        { path: 'duplicate.txt', data: 'first' },
        { path: 'duplicate.txt', data: 'second' }
      ])
    ).rejects.toThrow(ArchiveKitError);

    await expect(
      createZip([
        { path: 'folder/file.txt', data: '1' },
        { path: 'folder\\file.txt', data: '2' } // Backslash normalizes to duplicate
      ])
    ).rejects.toThrow(/Duplicate archive path/);
  });

  it('rejects Zip Slip path traversal and absolute paths', async () => {
    await expect(createZip([{ path: '../secret.txt', data: 'bad' }])).rejects.toThrow(
      /Path traversal/
    );
    await expect(createZip([{ path: '/etc/passwd', data: 'bad' }])).rejects.toThrow(
      /Absolute root paths are prohibited/
    );
    await expect(createZip([{ path: 'C:/Windows/cmd.exe', data: 'bad' }])).rejects.toThrow(
      /Absolute Windows drive paths are prohibited/
    );
    await expect(createZip([{ path: '//server/share/file', data: 'bad' }])).rejects.toThrow(
      /UNC network paths are prohibited/
    );
    await expect(createZip([{ path: 'sub/\0evil.txt', data: 'bad' }])).rejects.toThrow(
      /NUL byte/
    );
  });

  it('enforces maximum entry count limit', async () => {
    const entries = Array.from({ length: 15 }, (_, i) => ({
      path: `file_${i}.txt`,
      data: 'data'
    }));

    await expect(
      createZip(entries, { maxEntries: 10 })
    ).rejects.toThrow(/Archive entry count \(15\) exceeds the maximum limit/);
  });

  it('enforces maximum total input size limit', async () => {
    const bigEntry = {
      path: 'big.txt',
      data: new Uint8Array(2000)
    };

    await expect(
      createZip([bigEntry], { maxTotalInputSize: 1000 })
    ).rejects.toThrow(/Total uncompressed size/);
  });

  it('supports Blob output (createZipBlob)', async () => {
    const blob = await createZipBlob([{ path: 'file.txt', data: 'blob test' }]);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/zip');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('supports createZipFromFiles with mock File objects', async () => {
    const mockFile1 = new File(['file 1 content'], 'doc.txt', {
      type: 'text/plain',
      lastModified: 1700000000000
    });
    const mockFile2 = new File(['file 2 content'], 'pic.png', {
      type: 'image/png'
    });

    const zipBlob = await createZipFromFiles([mockFile1, mockFile2]);
    expect(zipBlob.type).toBe('application/zip');

    const zipBuffer = new Uint8Array(await zipBlob.arrayBuffer());
    const entries = await listZipEntries(zipBuffer);
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.path)).toEqual(['doc.txt', 'pic.png']);
  });

  it('supports Blob and ArrayBuffer as entry data', async () => {
    const blob = new Blob(['blob data']);
    const ab = new TextEncoder().encode('arraybuffer data').buffer;

    const zipBytes = await createZip([
      { path: 'from-blob.txt', data: blob },
      { path: 'from-ab.txt', data: ab }
    ]);

    const entries = await listZipEntries(zipBytes);
    expect(entries).toHaveLength(2);
  });

  it('handles per-entry compression level override and comments', async () => {
    const zipBytes = await createZip(
      [
        { path: 'f1.txt', data: 'data 1', compressionLevel: 0 },
        { path: 'f2.txt', data: 'data 2', compressionLevel: 9 }
      ],
      { comment: 'Archive level comment' }
    );

    const entries = await listZipEntries(zipBytes);
    expect(entries[0]?.compressionMethod).toBe(0);
    expect(entries[1]?.compressionMethod).toBe(8);
  });

  it('handles aborting during async createZip', async () => {
    const controller = new AbortController();
    const promise = createZip(
      [
        { path: '1.txt', data: '1' },
        { path: '2.txt', data: '2' }
      ],
      { signal: controller.signal }
    );
    controller.abort();
    await expect(promise).rejects.toThrow(ArchiveKitError);
  });

  it('merges options correctly via getZipCreateOptions', () => {
    const opts = getZipCreateOptions({ compression: 'store' });
    expect(opts.compression).toBe('store');
    expect(opts.compressionLevel).toBe(0);

    expect(() => getZipCreateOptions({ compression: 'bad' as any })).toThrow(
      ArchiveKitError
    );
  });

  it('validates entries correctly via validateZipEntries', () => {
    expect(() => validateZipEntries('not-an-array' as any)).toThrow(ArchiveKitError);
    expect(() => validateZipEntries([{ path: '' }])).toThrow(ArchiveKitError);
  });
});
