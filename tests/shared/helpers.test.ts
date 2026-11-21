import { describe, expect, it } from 'vitest';
import {
  ArchiveKitError,
  compareUint8Arrays,
  concatUint8Arrays,
  decodeUtf8,
  encodeUtf8,
  getBaseName,
  getDirName,
  isDirPath,
  normalizeZipPath,
  readBlobAsUint8Array,
  toArrayBuffer,
  toUint8Array,
  toUint8ArraySync,
  validateCompressionLevel,
  validateCompressionRatio,
  validateDecompressedSize,
  validateEntryCount,
  validateTotalDecompressedSize
} from '../../src/shared/index.js';

describe('Shared Utilities & Helpers', () => {
  it('tests toUint8Array and toUint8ArraySync conversions', async () => {
    const u8 = new Uint8Array([1, 2, 3]);
    const ab = u8.buffer;
    const blob = new Blob([u8]);

    expect(await toUint8Array(u8)).toBeInstanceOf(Uint8Array);
    expect(await toUint8Array(ab)).toBeInstanceOf(Uint8Array);
    expect(await toUint8Array(blob)).toBeInstanceOf(Uint8Array);

    expect(toUint8ArraySync(u8)).toBeInstanceOf(Uint8Array);
    expect(toUint8ArraySync(ab)).toBeInstanceOf(Uint8Array);

    // Invalid input throws
    await expect(toUint8Array(123 as any)).rejects.toThrow(ArchiveKitError);
    expect(() => toUint8ArraySync(123 as any)).toThrow(ArchiveKitError);
  });

  it('tests toArrayBuffer', () => {
    const ab = new ArrayBuffer(8);
    expect(toArrayBuffer(ab)).toBe(ab);

    const u8Full = new Uint8Array(ab);
    expect(toArrayBuffer(u8Full)).toBe(ab);

    const u8Slice = new Uint8Array(ab, 2, 4);
    const slicedAb = toArrayBuffer(u8Slice);
    expect(slicedAb.byteLength).toBe(4);

    expect(() => toArrayBuffer('bad' as any)).toThrow(ArchiveKitError);
  });

  it('tests encodeUtf8 and decodeUtf8 error handling', () => {
    expect(() => encodeUtf8(123 as any)).toThrow(ArchiveKitError);
    // Invalid UTF-8 sequence throws error because fatal: true
    const invalidUtf8 = new Uint8Array([0xff, 0xff, 0xff]);
    expect(() => decodeUtf8(invalidUtf8)).toThrow(ArchiveKitError);
  });

  it('tests concatUint8Arrays and compareUint8Arrays', () => {
    const a = new Uint8Array([1, 2]);
    const b = new Uint8Array([3, 4, 5]);
    const merged = concatUint8Arrays([a, b]);
    expect(merged).toEqual(new Uint8Array([1, 2, 3, 4, 5]));

    expect(compareUint8Arrays(a, new Uint8Array([1, 2]))).toBe(true);
    expect(compareUint8Arrays(a, b)).toBe(false);
    expect(compareUint8Arrays(a, new Uint8Array([1, 3]))).toBe(false);
  });

  it('tests readBlobAsUint8Array', async () => {
    const blob = new Blob(['hello blob']);
    const u8 = await readBlobAsUint8Array(blob);
    expect(new TextDecoder().decode(u8)).toBe('hello blob');
  });

  it('tests path utilities (normalizeZipPath, isDirPath, getBaseName, getDirName)', () => {
    expect(isDirPath('foo/bar/')).toBe(true);
    expect(isDirPath('foo/bar')).toBe(false);

    expect(getBaseName('folder/file.txt')).toBe('file.txt');
    expect(getBaseName('root.txt')).toBe('root.txt');
    expect(getBaseName('folder/')).toBe('folder');

    expect(getDirName('folder/sub/file.txt')).toBe('folder/sub');
    expect(getDirName('file.txt')).toBe('');

    expect(() => normalizeZipPath('')).toThrow(ArchiveKitError);
    expect(() => normalizeZipPath(null as any)).toThrow(ArchiveKitError);
    expect(() => normalizeZipPath('./')).toThrow(ArchiveKitError);
    expect(() => normalizeZipPath('a/../../b')).toThrow(ArchiveKitError);
  });

  it('tests validation helpers (compression level, ratio, limits)', () => {
    expect(validateCompressionLevel(undefined)).toBe(6);
    expect(validateCompressionLevel(3)).toBe(3);
    expect(() => validateCompressionLevel(1.5)).toThrow(ArchiveKitError);
    expect(() => validateCompressionLevel(10)).toThrow(ArchiveKitError);

    expect(() => validateEntryCount(100, 50)).toThrow(ArchiveKitError);
    expect(() => validateDecompressedSize(100, 50, 'test')).toThrow(ArchiveKitError);
    expect(() => validateTotalDecompressedSize(100, 50)).toThrow(ArchiveKitError);

    // Compression ratio limit on > 1MB uncompressed
    expect(() =>
      validateCompressionRatio(10_000_000, 100, 10, 'huge.txt')
    ).toThrow(ArchiveKitError);

    // Below 1MB uncompressed does not throw on ratio
    expect(() => validateCompressionRatio(100, 1, 10)).not.toThrow();
  });
});
