import {
  ArchiveKitError,
  calculatePercentageSaved,
  calculateRatio,
  toUint8Array,
  toUint8ArraySync,
  type BinaryInput
} from '../shared/index.js';
import type { GzipMetadata } from './types.js';

const GZIP_MAGIC_0 = 0x1f;
const GZIP_MAGIC_1 = 0x8b;
const GZIP_METHOD_DEFLATE = 0x08;

const FLG_FHCRC = 0x02;
const FLG_FEXTRA = 0x04;
const FLG_FNAME = 0x08;
const FLG_FCOMMENT = 0x10;

/**
 * Checks synchronously whether the given data has a valid GZIP header signature.
 */
export function isGzipDataSync(data: Uint8Array | ArrayBuffer): boolean {
  try {
    const bytes = toUint8ArraySync(data);
    return (
      bytes.length >= 10 &&
      bytes[0] === GZIP_MAGIC_0 &&
      bytes[1] === GZIP_MAGIC_1 &&
      bytes[2] === GZIP_METHOD_DEFLATE
    );
  } catch {
    return false;
  }
}

/**
 * Checks asynchronously whether the given data (Uint8Array, ArrayBuffer, Blob, File) has a valid GZIP signature.
 */
export async function isGzipData(data: BinaryInput): Promise<boolean> {
  try {
    const bytes = await toUint8Array(data);
    return isGzipDataSync(bytes);
  } catch {
    return false;
  }
}

/**
 * Synchronously parses GZIP header and trailer metadata.
 */
export function getGzipMetadataSync(data: Uint8Array | ArrayBuffer): GzipMetadata {
  const bytes = toUint8ArraySync(data);

  if (bytes.length < 10) {
    throw new ArchiveKitError(
      'INVALID_GZIP_DATA',
      'Input data is too small to be a valid GZIP stream (minimum 10 bytes required)'
    );
  }

  if (bytes[0] !== GZIP_MAGIC_0 || bytes[1] !== GZIP_MAGIC_1) {
    throw new ArchiveKitError(
      'INVALID_GZIP_DATA',
      `Invalid GZIP magic bytes: expected 0x1F8B, found 0x${(bytes[0] ?? 0).toString(16).padStart(2, '0')}${(bytes[1] ?? 0).toString(16).padStart(2, '0')}`
    );
  }

  const method = bytes[2];
  if (method !== GZIP_METHOD_DEFLATE) {
    throw new ArchiveKitError(
      'UNSUPPORTED_COMPRESSION',
      `Unsupported GZIP compression method: ${method} (only DEFLATE 8 is standard)`
    );
  }

  const flg = bytes[3] ?? 0;
  const mtimeSeconds =
    (bytes[4] ?? 0) |
    ((bytes[5] ?? 0) << 8) |
    ((bytes[6] ?? 0) << 16) |
    ((bytes[7] ?? 0) * 0x1000000);
  const mtime = mtimeSeconds > 0 ? new Date(mtimeSeconds * 1000) : undefined;
  const os = bytes[9];

  let offset = 10;

  // Extra field
  if ((flg & FLG_FEXTRA) !== 0) {
    if (offset + 2 > bytes.length) {
      throw new ArchiveKitError('INVALID_GZIP_DATA', 'Truncated GZIP extra field');
    }
    const xlen = (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
    offset += 2 + xlen;
    if (offset > bytes.length) {
      throw new ArchiveKitError('INVALID_GZIP_DATA', 'Truncated GZIP extra field payload');
    }
  }

  // Original file name (null-terminated string)
  let filename: string | undefined;
  if ((flg & FLG_FNAME) !== 0) {
    const fnStart = offset;
    while (offset < bytes.length && bytes[offset] !== 0) {
      offset++;
    }
    if (offset >= bytes.length) {
      throw new ArchiveKitError('INVALID_GZIP_DATA', 'Truncated GZIP filename');
    }
    const fnBytes = bytes.subarray(fnStart, offset);
    try {
      filename = new TextDecoder('utf-8', { fatal: false }).decode(fnBytes);
    } catch {
      filename = String.fromCharCode(...fnBytes);
    }
    offset++; // skip null terminator
  }

  // Comment (null-terminated string)
  let comment: string | undefined;
  if ((flg & FLG_FCOMMENT) !== 0) {
    const cmStart = offset;
    while (offset < bytes.length && bytes[offset] !== 0) {
      offset++;
    }
    if (offset >= bytes.length) {
      throw new ArchiveKitError('INVALID_GZIP_DATA', 'Truncated GZIP comment');
    }
    const cmBytes = bytes.subarray(cmStart, offset);
    try {
      comment = new TextDecoder('utf-8', { fatal: false }).decode(cmBytes);
    } catch {
      comment = String.fromCharCode(...cmBytes);
    }
    offset++; // skip null terminator
  }

  // Header CRC16
  if ((flg & FLG_FHCRC) !== 0) {
    offset += 2;
    if (offset > bytes.length) {
      throw new ArchiveKitError('INVALID_GZIP_DATA', 'Truncated GZIP header CRC');
    }
  }

  // Read ISIZE from the last 4 bytes of the trailer if stream length permits
  let originalSize: number | undefined;
  if (bytes.length >= 18) {
    const trailerOffset = bytes.length - 4;
    originalSize =
      ((bytes[trailerOffset] ?? 0) |
        ((bytes[trailerOffset + 1] ?? 0) << 8) |
        ((bytes[trailerOffset + 2] ?? 0) << 16) |
        ((bytes[trailerOffset + 3] ?? 0) * 0x1000000)) >>>
      0;
  }

  const compressedSize = bytes.length;
  const ratio = originalSize !== undefined ? calculateRatio(compressedSize, originalSize) : 1;
  const saved = originalSize !== undefined ? calculatePercentageSaved(compressedSize, originalSize) : 0;

  // Deriving output filename suggestion
  let outputFilename: string | undefined = filename;
  if (!outputFilename) {
    outputFilename = 'extracted';
  }

  return {
    originalSize,
    compressedSize,
    compressionRatio: ratio,
    compressionPercentageSaved: saved,
    filename,
    comment,
    mtime,
    os,
    mimeType: 'application/gzip',
    outputFilename
  };
}

/**
 * Asynchronously parses GZIP metadata from any supported BinaryInput.
 */
export async function getGzipMetadata(data: BinaryInput): Promise<GzipMetadata> {
  const bytes = await toUint8Array(data);
  return getGzipMetadataSync(bytes);
}
