import { gunzip, gunzipSync } from 'fflate';
import {
  ArchiveKitError,
  computeCrc32,
  createBlob,
  decodeUtf8,
  toUint8Array,
  toUint8ArraySync,
  type BinaryInput
} from '../shared/index.js';
import type { GzipDecompressBlobOptions, GzipDecompressOptions } from './types.js';

const GZIP_MAGIC_0 = 0x1f;
const GZIP_MAGIC_1 = 0x8b;
const GZIP_METHOD_DEFLATE = 0x08;

function validateGzipHeader(bytes: Uint8Array): void {
  if (bytes.length === 0) {
    throw new ArchiveKitError(
      'INVALID_GZIP_DATA',
      'Input data is empty or too small to be valid GZIP'
    );
  }
  if (bytes.length < 2 || bytes[0] !== GZIP_MAGIC_0 || bytes[1] !== GZIP_MAGIC_1) {
    throw new ArchiveKitError(
      'INVALID_GZIP_DATA',
      `Invalid GZIP magic bytes: expected 0x1F8B, found 0x${(bytes[0] ?? 0).toString(16).padStart(2, '0')}${(bytes[1] ?? 0).toString(16).padStart(2, '0')}`
    );
  }
  if (bytes.length < 18) {
    throw new ArchiveKitError(
      'INVALID_GZIP_DATA',
      'Input data is too small to be valid GZIP (minimum 18 bytes required for header and trailer)'
    );
  }
  if (bytes[2] !== GZIP_METHOD_DEFLATE) {
    throw new ArchiveKitError(
      'UNSUPPORTED_COMPRESSION',
      `Unsupported GZIP compression method: ${bytes[2]}`
    );
  }
}

function verifyGzipTrailer(compressedBytes: Uint8Array, decompressed: Uint8Array): void {
  const trailerOffset = compressedBytes.length - 8;
  const expectedCrc =
    ((compressedBytes[trailerOffset] ?? 0) |
      ((compressedBytes[trailerOffset + 1] ?? 0) << 8) |
      ((compressedBytes[trailerOffset + 2] ?? 0) << 16) |
      ((compressedBytes[trailerOffset + 3] ?? 0) * 0x1000000)) >>>
    0;

  const expectedIsize =
    ((compressedBytes[trailerOffset + 4] ?? 0) |
      ((compressedBytes[trailerOffset + 5] ?? 0) << 8) |
      ((compressedBytes[trailerOffset + 6] ?? 0) << 16) |
      ((compressedBytes[trailerOffset + 7] ?? 0) * 0x1000000)) >>>
    0;

  const actualCrc = computeCrc32(decompressed);
  if (actualCrc !== expectedCrc) {
    throw new ArchiveKitError(
      'DECOMPRESSION_FAILED',
      `GZIP CRC-32 checksum mismatch: expected 0x${expectedCrc.toString(16)}, got 0x${actualCrc.toString(16)} (archive corrupted)`
    );
  }

  const actualIsize = (decompressed.length >>> 0);
  if (actualIsize !== expectedIsize) {
    throw new ArchiveKitError(
      'DECOMPRESSION_FAILED',
      `GZIP ISIZE mismatch: expected ${expectedIsize} bytes, got ${actualIsize} bytes (archive truncated or corrupted)`
    );
  }
}

/**
 * Decompresses GZIP binary data asynchronously.
 *
 * @param data - GZIP data as Uint8Array, ArrayBuffer, Blob, or File.
 * @param options - Decompression options including cancellation signal.
 * @returns Decompressed Uint8Array.
 */
export async function gzipDecompress(
  data: BinaryInput,
  options?: GzipDecompressOptions
): Promise<Uint8Array> {
  if (options?.signal?.aborted) {
    throw new ArchiveKitError('OPERATION_CANCELLED', 'Decompression was aborted');
  }

  const bytes = await toUint8Array(data);
  validateGzipHeader(bytes);

  return new Promise<Uint8Array>((resolve, reject) => {
    let completed = false;

    if (options?.signal) {
      options.signal.addEventListener('abort', () => {
        if (!completed) {
          completed = true;
          reject(new ArchiveKitError('OPERATION_CANCELLED', 'Decompression was aborted'));
        }
      });
    }

    gunzip(bytes, (err, result) => {
      if (completed) return;
      completed = true;
      if (err) {
        reject(
          new ArchiveKitError(
            'DECOMPRESSION_FAILED',
            `GZIP decompression failed (corrupted or truncated archive): ${err.message}`,
            err
          )
        );
      } else {
        try {
          verifyGzipTrailer(bytes, result);
          resolve(result);
        } catch (verifyErr) {
          reject(verifyErr);
        }
      }
    });
  });
}

/**
 * Synchronous GZIP decompression for small in-memory buffers.
 *
 * @warning Blocks main thread on large buffers.
 */
export function gzipDecompressSync(
  data: Uint8Array | ArrayBuffer,
  _options?: GzipDecompressOptions
): Uint8Array {
  const bytes = toUint8ArraySync(data);
  validateGzipHeader(bytes);

  try {
    const result = gunzipSync(bytes);
    verifyGzipTrailer(bytes, result);
    return result;
  } catch (err) {
    if (err instanceof ArchiveKitError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new ArchiveKitError(
      'DECOMPRESSION_FAILED',
      `GZIP decompression failed (corrupted or truncated archive): ${message}`,
      err
    );
  }
}

/**
 * Decompresses GZIP data directly into a UTF-8 string asynchronously.
 */
export async function gzipDecompressText(
  data: BinaryInput,
  options?: GzipDecompressOptions
): Promise<string> {
  const decompressed = await gzipDecompress(data, options);
  return decodeUtf8(decompressed);
}

/**
 * Synchronous GZIP decompression to string for small in-memory data.
 */
export function gzipDecompressTextSync(
  data: Uint8Array | ArrayBuffer,
  options?: GzipDecompressOptions
): string {
  const decompressed = gzipDecompressSync(data, options);
  return decodeUtf8(decompressed);
}

/**
 * Decompresses GZIP data directly into a browser-ready Blob.
 */
export async function gzipDecompressBlob(
  data: BinaryInput,
  options?: GzipDecompressBlobOptions
): Promise<Blob> {
  const decompressed = await gzipDecompress(data, options);
  return createBlob(decompressed, options?.mimeType ?? 'application/octet-stream');
}
