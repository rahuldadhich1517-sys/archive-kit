import { describe, expect, it } from 'vitest';
import {
  ArchiveKitError,
  createBlob,
  createZip,
  createZipFromFiles,
  createZipSync,
  extractZip,
  extractZipEntry,
  getGzipMetadata,
  getGzipMetadataSync,
  getZipMetadata,
  gzipCompress,
  gzipCompressText,
  gzipCompressTextSync,
  gzipDecompress,
  gzipDecompressSync,
  gzipDecompressTextSync,
  isGzipData,
  isGzipDataSync,
  isZipArchive,
  isZipArchiveSync,
  listZipEntries,
  readLocalHeader,
  validateZipArchive,
  validateZipEntries
} from '../src/index.js';

describe('Coverage Boost Edge Cases', () => {
  it('tests gzipCompressTextSync and gzipDecompressTextSync', () => {
    const compressed = gzipCompressTextSync('Sync boost test');
    expect(compressed).toBeInstanceOf(Uint8Array);
    const decompressed = gzipDecompressTextSync(compressed);
    expect(decompressed).toBe('Sync boost test');
  });

  it('tests async cancellation with pre-aborted signal for gzip', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      gzipCompress(new Uint8Array(10), { signal: controller.signal })
    ).rejects.toThrow(/aborted/);

    await expect(
      gzipDecompress(new Uint8Array(20), { signal: controller.signal })
    ).rejects.toThrow(/aborted/);
  });

  it('tests GZIP metadata truncation edge cases', () => {
    // Truncated extra field
    const truncatedExtra = new Uint8Array([
      0x1f, 0x8b, 0x08, 0x04,
      0, 0, 0, 0, 0, 0,
      10, 0, // xlen = 10, but buffer ends!
      1, 2
    ]);
    expect(() => getGzipMetadataSync(truncatedExtra)).toThrow(/Truncated GZIP extra field/);

    // Truncated comment (no null terminator)
    const truncatedComment = new Uint8Array([
      0x1f, 0x8b, 0x08, 0x10,
      0, 0, 0, 0, 0, 0,
      0x41, 0x42 // 'AB' without \0
    ]);
    expect(() => getGzipMetadataSync(truncatedComment)).toThrow(/Truncated GZIP comment/);

    // Truncated filename (no null terminator)
    const truncatedFilename = new Uint8Array([
      0x1f, 0x8b, 0x08, 0x08,
      0, 0, 0, 0, 0, 0,
      0x41, 0x42 // 'AB' without \0
    ]);
    expect(() => getGzipMetadataSync(truncatedFilename)).toThrow(/Truncated GZIP filename/);

    // Truncated header CRC
    const truncatedCrc = new Uint8Array([
      0x1f, 0x8b, 0x08, 0x02,
      0, 0, 0, 0, 0, 0,
      1 // only 1 byte of 2-byte CRC
    ]);
    expect(() => getGzipMetadataSync(truncatedCrc)).toThrow(/Truncated GZIP header CRC/);
  });

  it('tests isZipArchiveSync branches', () => {
    expect(isZipArchiveSync(new Uint8Array(10))).toBe(false);

    // Bad initial signature
    const badStart = new Uint8Array(30);
    badStart[0] = 0x12;
    expect(isZipArchiveSync(badStart)).toBe(false);

    // Valid start (PK\x03\x04) but no EOCD
    const noEocd = new Uint8Array(30);
    noEocd[0] = 0x50;
    noEocd[1] = 0x4b;
    noEocd[2] = 0x03;
    noEocd[3] = 0x04;
    expect(isZipArchiveSync(noEocd)).toBe(false);
  });

  it('tests isGzipData and isZipArchive error fallbacks', async () => {
    expect(await isGzipData(null as any)).toBe(false);
    expect(await isZipArchive(null as any)).toBe(false);
  });

  it('tests createZipFromFiles with custom path wrapper', async () => {
    const file = new File(['content'], 'original.txt');
    const blob = await createZipFromFiles([{ file, path: 'custom/nested.txt' }]);
    const entries = await listZipEntries(blob);
    expect(entries[0]?.path).toBe('custom/nested.txt');
  });

  it('tests createZip with null data and long comment branches', async () => {
    const zipData = await createZip([
      { path: 'null-data.txt', data: undefined },
      { path: 'empty-comment.txt', data: 'data' }
    ], { comment: '' });

    expect(zipData.length).toBeGreaterThan(0);

    // Test with comment > 65535 bytes (ignored)
    const longComment = 'a'.repeat(70_000);
    const zipLongComment = await createZip(
      [{ path: 'test.txt', data: 'ok' }],
      { comment: longComment }
    );
    expect(zipLongComment.length).toBeGreaterThan(0);
  });

  it('tests readLocalHeader error handling', () => {
    const small = new Uint8Array(20);
    expect(() => readLocalHeader(small, 0)).toThrow(/Truncated local file header/);

    const badSig = new Uint8Array(40);
    expect(() => readLocalHeader(badSig, 0)).toThrow(/Expected local file header signature/);

    // Header with enormous extra length
    const badOffset = new Uint8Array(40);
    badOffset[0] = 0x50;
    badOffset[1] = 0x4b;
    badOffset[2] = 0x03;
    badOffset[3] = 0x04;
    badOffset[28] = 0xff;
    badOffset[29] = 0xff; // extraLen = 65535
    expect(() => readLocalHeader(badOffset, 0)).toThrow(/Data offset 65565 extends beyond/);
  });

  it('tests Central Directory truncation and corrupt offsets', async () => {
    const zipData = await createZip([{ path: 'test.txt', data: 'data' }]);
    const tampered = new Uint8Array(zipData);

    // Point central directory offset beyond end of file
    // In EOCD (last 22 bytes), offset is at eocd + 16 (which is zipData.length - 6)
    const cdOffsetPos = tampered.length - 6;
    tampered[cdOffsetPos] = 0xff;
    tampered[cdOffsetPos + 1] = 0xff;
    tampered[cdOffsetPos + 2] = 0xff;
    tampered[cdOffsetPos + 3] = 0x7f; // massive offset

    await expect(extractZip(tampered)).rejects.toThrow(
      /Central directory offset \(\d+\) points beyond archive bounds/
    );

    // Tampered central directory signature
    const tamperedSig = new Uint8Array(zipData);
    const validCdOffset = tamperedSig[cdOffsetPos] | (tamperedSig[cdOffsetPos + 1] << 8);
    tamperedSig[validCdOffset] = 0x00; // corrupt signature
    await expect(extractZip(tamperedSig)).rejects.toThrow(
      /Invalid Central Directory signature/
    );
  });

  it('tests STORE entry CRC mismatch detection', async () => {
    const storeZip = await createZip(
      [{ path: 'store.txt', data: 'Exact store data' }],
      { compression: 'store' }
    );
    const tampered = new Uint8Array(storeZip);
    // Find "Exact store data" in buffer and change a byte
    const payload = new TextEncoder().encode('Exact store data');
    for (let i = 0; i < tampered.length - payload.length; i++) {
      let m = true;
      for (let j = 0; j < payload.length; j++) {
        if (tampered[i + j] !== payload[j]) { m = false; break; }
      }
      if (m) {
        tampered[i] ^= 0x01; // flip 1 bit
        break;
      }
    }
    await expect(extractZip(tampered)).rejects.toThrow(/CRC-32 checksum mismatch for STORE/);
  });

  it('tests createZipFromFiles validation and options validation', async () => {
    await expect(createZipFromFiles('not-an-array' as any)).rejects.toThrow(/Expected an array/);
  });

  it('tests parseCentralDirectory entry comment and size limits', async () => {
    const zipData = await createZip([
      { path: 'f1.txt', data: 'hello' }
    ]);
    const tampered = new Uint8Array(zipData);

    // Tamper uncompressed size in Central Directory to exceed 1GB default limit
    const cdOffset = zipData[zipData.length - 6] | (zipData[zipData.length - 5] << 8);
    tampered[cdOffset + 24] = 0xff;
    tampered[cdOffset + 25] = 0xff;
    tampered[cdOffset + 26] = 0xff;
    tampered[cdOffset + 27] = 0x7f; // 2GB

    await expect(listZipEntries(tampered)).rejects.toThrow(/decompressed size.*exceeds limit/);
  });

  it('tests aborted signal during extractZip and extractZipEntry', async () => {
    const zipData = await createZip([{ path: 'test.txt', data: 'data' }]);
    const controller = new AbortController();
    controller.abort();

    await expect(extractZip(zipData, { signal: controller.signal })).rejects.toThrow(
      /aborted/
    );
    await expect(
      extractZipEntry(zipData, 'test.txt', { signal: controller.signal })
    ).rejects.toThrow(/aborted/);
  });

  it('tests isGzipDataSync with invalid inputs returning false', () => {
    expect(isGzipDataSync(null as any)).toBe(false);
    expect(isGzipDataSync(123 as any)).toBe(false);
  });

  it('tests validateZipArchive with unsupported compression method error', async () => {
    const zipData = await createZip([{ path: 'test.txt', data: 'data' }]);
    const tampered = new Uint8Array(zipData);
    const cdOffset = zipData[zipData.length - 6] | (zipData[zipData.length - 5] << 8);
    tampered[cdOffset + 10] = 99; // method 99

    const verdict = await validateZipArchive(tampered);
    expect(verdict.valid).toBe(false);
    expect(verdict.errors.some((e) => e.includes('unsupported compression method 99'))).toBe(true);

    await expect(extractZip(tampered)).rejects.toThrow(
      /Unsupported compression method \(99\)/
    );
  });

  it('tests createZipSync with per-entry compression level override', () => {
    const zip = createZipSync([
      { path: 'f1.txt', data: '1', compressionLevel: 0 },
      { path: 'f2.txt', data: '2', compressionLevel: 9 }
    ]);
    expect(zip).toBeInstanceOf(Uint8Array);
  });

  it('tests metadata suggestion when filename is omitted', async () => {
    const compressed = await gzipCompressText('No filename');
    const meta = await getGzipMetadata(compressed);
    expect(meta.outputFilename).toBe('extracted');
  });

  it('tests unsupported compression method in gzipDecompress and gzipDecompressSync', async () => {
    const badMethod = new Uint8Array([
      0x1f, 0x8b, 0x07, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0
    ]);
    await expect(gzipDecompress(badMethod)).rejects.toThrow(/Unsupported GZIP compression method/);
    expect(() => gzipDecompressSync(badMethod)).toThrow(/Unsupported GZIP compression method/);
  });

  it('tests gzipDecompressSync CRC mismatch', () => {
    const compressed = gzipCompressTextSync('Sync crc test');
    const tampered = new Uint8Array(compressed);
    tampered[tampered.length - 8] ^= 0xff; // corrupt trailer CRC
    expect(() => gzipDecompressSync(tampered)).toThrow(/GZIP CRC-32 checksum mismatch/);
  });

  it('tests validateZipEntries compressionLevel branch', () => {
    expect(() =>
      validateZipEntries([{ path: 'test.txt', compressionLevel: 9 }])
    ).not.toThrow();

    expect(() =>
      validateZipEntries([{ path: 'test.txt', compressionLevel: 99 }])
    ).toThrow(ArchiveKitError);
  });

  it('tests GZIP metadata with MTIME > 0', () => {
    const withMtime = new Uint8Array([
      0x1f, 0x8b, 0x08, 0,
      100, 0, 0, 0, // mtime = 100 seconds
      0, 0
    ]);
    const meta = getGzipMetadataSync(withMtime);
    expect(meta.mtime).toBeDefined();
    expect(meta.mtime?.getTime()).toBe(100_000);
  });

  it('tests GZIP ISIZE mismatch branch in decompress', async () => {
    const compressed = await gzipCompressText('Testing isize mismatch');
    const tampered = new Uint8Array(compressed);
    // Tamper ISIZE (last 4 bytes)
    tampered[tampered.length - 1] ^= 0x01;
    await expect(gzipDecompress(tampered)).rejects.toThrow(/GZIP ISIZE mismatch|GZIP CRC-32 checksum mismatch/);
  });

  it('tests createZipSync with null data and directory', () => {
    const zip = createZipSync([
      { path: 'null-entry.txt', data: null as any },
      { path: 'dir-entry/', type: 'directory' }
    ]);
    expect(zip).toBeInstanceOf(Uint8Array);
  });

  it('tests createBlob with array of chunks', () => {
    const chunk1 = new Uint8Array([1, 2]);
    const chunk2 = new Uint8Array([3, 4]);
    const blob = createBlob([chunk1, chunk2], 'application/test');
    expect(blob.type).toBe('application/test');
    expect(blob.size).toBe(4);
  });

  it('tests GZIP header with valid FHCRC flag', () => {
    const withFhcrc = new Uint8Array([
      0x1f, 0x8b, 0x08,
      0x02, // FLG_FHCRC
      0, 0, 0, 0, 0, 0,
      0x12, 0x34 // 2-byte header CRC
    ]);
    const meta = getGzipMetadataSync(withFhcrc);
    expect(meta.compressedSize).toBe(withFhcrc.length);
  });
  it('tests GZIP metadata when mtime is 0', () => {
    const zeroMtime = new Uint8Array([0x1f, 0x8b, 0x08, 0, 0, 0, 0, 0, 0, 0]);
    const meta = getGzipMetadataSync(zeroMtime);
    expect(meta.mtime).toBeUndefined();
  });

  it('tests metadata with empty original size and ratio calculations', () => {
    const compressed = gzipCompressTextSync('');
    const meta = getGzipMetadataSync(compressed);
    expect(meta.originalSize).toBe(0);
    expect(meta.compressionRatio).toBe(1);
    expect(meta.compressionPercentageSaved).toBe(0);
  });

  it('tests getZipMetadata with encrypted entry detection', async () => {
    const zipData = await createZip([{ path: 'secret.txt', data: 'data' }]);
    const tampered = new Uint8Array(zipData);
    const cdOffset = zipData[zipData.length - 6] | (zipData[zipData.length - 5] << 8);
    tampered[cdOffset + 8] |= 1; // set encrypted bit

    const meta = await getZipMetadata(tampered);
    expect(meta.hasEncryptedEntries).toBe(true);
  });
});
