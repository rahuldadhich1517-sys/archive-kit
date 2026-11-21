import { describe, expect, it } from 'vitest';
import {
  ArchiveKitError,
  getGzipMetadata,
  getGzipMetadataSync,
  gzipCompress,
  gzipCompressBlob,
  gzipCompressSync,
  gzipCompressText,
  gzipCompressTextSync,
  gzipDecompress,
  gzipDecompressBlob,
  gzipDecompressSync,
  gzipDecompressText,
  gzipDecompressTextSync,
  isGzipData,
  isGzipDataSync
} from '../../src/index.js';

describe('GZIP utility', () => {
  const sampleText = 'Hello, ArchiveKit! This is a test of browser-compatible GZIP compression.';
  const sampleBytes = new TextEncoder().encode(sampleText);

  it('compresses and decompresses plain text round-trip (async)', async () => {
    const compressed = await gzipCompressText(sampleText);
    expect(compressed).toBeInstanceOf(Uint8Array);
    expect(compressed.length).toBeGreaterThan(0);

    const decompressed = await gzipDecompressText(compressed);
    expect(decompressed).toBe(sampleText);
  });

  it('compresses and decompresses plain text round-trip (sync)', () => {
    const compressed = gzipCompressTextSync(sampleText);
    expect(compressed).toBeInstanceOf(Uint8Array);

    const decompressed = gzipDecompressTextSync(compressed);
    expect(decompressed).toBe(sampleText);
  });

  it('compresses and decompresses binary data with exact byte fidelity', async () => {
    const binary = new Uint8Array(256);
    for (let i = 0; i < 256; i++) binary[i] = i;

    const compressed = await gzipCompress(binary);
    const decompressed = await gzipDecompress(compressed);

    expect(decompressed.length).toBe(binary.length);
    expect(decompressed).toEqual(binary);
  });

  it('supports ArrayBuffer input', async () => {
    const buffer = sampleBytes.buffer.slice(
      sampleBytes.byteOffset,
      sampleBytes.byteOffset + sampleBytes.byteLength
    );
    const compressed = await gzipCompress(buffer);
    const decompressed = await gzipDecompress(compressed.buffer);
    expect(new TextDecoder().decode(decompressed)).toBe(sampleText);
  });

  it('handles empty input correctly', async () => {
    const compressed = await gzipCompress(new Uint8Array(0));
    expect(compressed.length).toBeGreaterThan(0); // GZIP has header and trailer

    const decompressed = await gzipDecompress(compressed);
    expect(decompressed.length).toBe(0);
  });

  it('handles Unicode and emoji text without corruption', async () => {
    const unicodeText = '🌟 Multi-lingual test: 简体中文, 日本語, 한국어, العربية, Русский, 🚀📦✨';
    const compressed = await gzipCompressText(unicodeText);
    const decompressed = await gzipDecompressText(compressed);
    expect(decompressed).toBe(unicodeText);
  });

  it('handles large repetitive input efficiently', async () => {
    const largeText = 'A'.repeat(500_000);
    const compressed = await gzipCompressText(largeText);
    expect(compressed.length).toBeLessThan(largeText.length / 10); // High compression ratio

    const decompressed = await gzipDecompressText(compressed);
    expect(decompressed).toBe(largeText);
  });

  it('supports configurable compression levels (0-9)', async () => {
    const text = 'Repetitive string '.repeat(100);
    const store = await gzipCompressText(text, { level: 0 });
    const max = await gzipCompressText(text, { level: 9 });

    expect(max.length).toBeLessThan(store.length);

    expect(await gzipDecompressText(store)).toBe(text);
    expect(await gzipDecompressText(max)).toBe(text);
  });

  it('rejects invalid compression levels', async () => {
    await expect(gzipCompress(sampleBytes, { level: 10 })).rejects.toThrow(ArchiveKitError);
    await expect(gzipCompress(sampleBytes, { level: -1 })).rejects.toThrow(ArchiveKitError);
  });

  it('supports Blob input and output', async () => {
    const blob = new Blob([sampleText], { type: 'text/plain' });
    const compressedBlob = await gzipCompressBlob(blob);
    expect(compressedBlob.type).toBe('application/gzip');

    const decompressedBlob = await gzipDecompressBlob(compressedBlob);
    const text = await decompressedBlob.text();
    expect(text).toBe(sampleText);
  });

  it('detects valid and invalid GZIP data signatures', async () => {
    const compressed = await gzipCompress(sampleBytes);
    expect(isGzipDataSync(compressed)).toBe(true);
    expect(await isGzipData(compressed)).toBe(true);

    const invalid = new Uint8Array([0x00, 0x11, 0x22]);
    expect(isGzipDataSync(invalid)).toBe(false);
    expect(await isGzipData(invalid)).toBe(false);
  });

  it('extracts metadata correctly including filename and ISIZE', async () => {
    const compressed = gzipCompressSync(sampleBytes, {
      filename: 'test.txt',
      mtime: new Date(1700000000000)
    });

    const meta = getGzipMetadataSync(compressed);
    expect(meta.filename).toBe('test.txt');
    expect(meta.compressedSize).toBe(compressed.length);
    expect(meta.originalSize).toBe(sampleBytes.length);
    expect(meta.compressionRatio).toBeGreaterThan(0);
    expect(meta.mtime).toBeDefined();

    const asyncMeta = await getGzipMetadata(compressed);
    expect(asyncMeta.filename).toBe('test.txt');
  });

  it('handles gzipCompressSync with string and gzipDecompressTextSync', () => {
    const compressed = gzipCompressSync('Sync test string');
    const text = gzipDecompressTextSync(compressed);
    expect(text).toBe('Sync test string');
  });

  it('handles gzipDecompressBlob with custom mime type', async () => {
    const compressed = await gzipCompressText('Blob custom');
    const blob = await gzipDecompressBlob(compressed, { mimeType: 'text/custom' });
    expect(blob.type).toBe('text/custom');
    expect(await blob.text()).toBe('Blob custom');
  });

  it('handles GZIP metadata edge cases', () => {
    // Too small data
    expect(() => getGzipMetadataSync(new Uint8Array([0x1f, 0x8b]))).toThrow(ArchiveKitError);

    // Unsupported method in header
    expect(() =>
      getGzipMetadataSync(new Uint8Array([0x1f, 0x8b, 0x09, 0, 0, 0, 0, 0, 0, 0]))
    ).toThrow(ArchiveKitError);

    // Header with extra field and comment
    const headerWithExtra = new Uint8Array([
      0x1f, 0x8b, 0x08,
      0x04 | 0x10, // FEXTRA + FCOMMENT
      0, 0, 0, 0,
      0, 0,
      4, 0, // xlen = 4
      1, 2, 3, 4, // extra bytes
      0x48, 0x69, 0x00 // "Hi\0" comment
    ]);
    const meta = getGzipMetadataSync(headerWithExtra);
    expect(meta.comment).toBe('Hi');
  });

  it('throws INVALID_GZIP_DATA on empty input to decompress', async () => {
    await expect(gzipDecompress(new Uint8Array(0))).rejects.toThrow(ArchiveKitError);
    expect(() => gzipDecompressSync(new Uint8Array(0))).toThrow(ArchiveKitError);
  });

  it('throws INVALID_GZIP_DATA on invalid magic bytes', async () => {
    const fakeData = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x10]);
    await expect(gzipDecompress(fakeData)).rejects.toThrow(/Invalid GZIP magic bytes/);
  });

  it('throws DECOMPRESSION_FAILED on corrupted compressed content', async () => {
    const compressed = await gzipCompress(sampleBytes);
    // Corrupt byte in compressed payload
    compressed[12] = (compressed[12] ?? 0) ^ 0xff;
    compressed[13] = (compressed[13] ?? 0) ^ 0xff;
    await expect(gzipDecompress(compressed)).rejects.toThrow(ArchiveKitError);
  });

  it('throws DECOMPRESSION_FAILED on truncated GZIP data', async () => {
    const compressed = await gzipCompress(sampleBytes);
    const truncated = compressed.subarray(0, 15);
    await expect(gzipDecompress(truncated)).rejects.toThrow(ArchiveKitError);
  });

  it('supports cancellation with AbortSignal', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(gzipCompress(sampleBytes, { signal: controller.signal })).rejects.toThrow(
      /aborted/
    );
    await expect(gzipDecompress(sampleBytes, { signal: controller.signal })).rejects.toThrow(
      /aborted/
    );
  });
});
