import { gzip, gzipSync } from 'fflate';
import {
  ArchiveKitError,
  createBlob,
  encodeUtf8,
  toUint8Array,
  toUint8ArraySync,
  validateCompressionLevel,
  type BinaryInput
} from '../shared/index.js';
import type { GzipCompressBlobOptions, GzipCompressOptions } from './types.js';

/**
 * Compresses binary data with GZIP asynchronously.
 * Suitable for browser applications to prevent blocking the UI.
 *
 * @param data - Input data as Uint8Array, ArrayBuffer, Blob, or File.
 * @param options - Compression options including level (0-9) and metadata.
 * @returns Compressed Uint8Array.
 */
export async function gzipCompress(
  data: BinaryInput,
  options?: GzipCompressOptions
): Promise<Uint8Array> {
  if (options?.signal?.aborted) {
    throw new ArchiveKitError('OPERATION_CANCELLED', 'Compression was aborted');
  }

  const bytes = await toUint8Array(data);
  const level = validateCompressionLevel(options?.level);

  return new Promise<Uint8Array>((resolve, reject) => {
    let completed = false;

    if (options?.signal) {
      options.signal.addEventListener('abort', () => {
        if (!completed) {
          completed = true;
          reject(new ArchiveKitError('OPERATION_CANCELLED', 'Compression was aborted'));
        }
      });
    }

    gzip(
      bytes,
      {
        level: level as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
        filename: options?.filename,
        mtime: options?.mtime
      },
      (err, result) => {
        if (completed) return;
        completed = true;
        if (err) {
          reject(
            new ArchiveKitError('INVALID_INPUT', `GZIP compression failed: ${err.message}`, err)
          );
        } else {
          resolve(result);
        }
      }
    );
  });
}

/**
 * Synchronous GZIP compression for small in-memory buffers.
 *
 * @warning Calling this on large buffers will block the JavaScript main thread.
 */
export function gzipCompressSync(
  data: Uint8Array | ArrayBuffer | string,
  options?: GzipCompressOptions
): Uint8Array {
  const bytes = typeof data === 'string' ? encodeUtf8(data) : toUint8ArraySync(data);
  const level = validateCompressionLevel(options?.level);

  try {
    return gzipSync(bytes, {
      level: level as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
      filename: options?.filename,
      mtime: options?.mtime
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ArchiveKitError('INVALID_INPUT', `GZIP compression failed: ${message}`, err);
  }
}

/**
 * Compresses a UTF-8 text string into GZIP bytes asynchronously.
 */
export async function gzipCompressText(
  text: string,
  options?: GzipCompressOptions
): Promise<Uint8Array> {
  const bytes = encodeUtf8(text);
  return gzipCompress(bytes, options);
}

/**
 * Synchronous text GZIP compression for small strings.
 *
 * @warning Blocks main thread on large strings.
 */
export function gzipCompressTextSync(
  text: string,
  options?: GzipCompressOptions
): Uint8Array {
  const bytes = encodeUtf8(text);
  return gzipCompressSync(bytes, options);
}

/**
 * Compresses data and returns a browser-ready Blob.
 */
export async function gzipCompressBlob(
  data: BinaryInput,
  options?: GzipCompressBlobOptions
): Promise<Blob> {
  const compressed = await gzipCompress(data, options);
  return createBlob(compressed, options?.mimeType ?? 'application/gzip');
}
