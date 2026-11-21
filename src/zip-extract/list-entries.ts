import {
  calculateRatio,
  toUint8Array,
  toUint8ArraySync,
  type BinaryInput
} from '../shared/index.js';
import { findEocd, parseCentralDirectory, readU32LE, SIG_EOCD, SIG_LOC } from './parse.js';
import type { ZipEntryInfo, ZipInspectionOptions, ZipMetadata } from './types.js';

/**
 * Checks synchronously whether the given buffer has valid ZIP archive signatures.
 */
export function isZipArchiveSync(data: Uint8Array | ArrayBuffer): boolean {
  try {
    const bytes = toUint8ArraySync(data);
    if (bytes.length < 22) return false;
    const firstSig = readU32LE(bytes, 0);
    // Must start with local header (PK\x03\x04) or empty archive EOCD (PK\x05\x06)
    if (firstSig !== SIG_LOC && firstSig !== SIG_EOCD) {
      return false;
    }
    return findEocd(bytes) !== -1;
  } catch {
    return false;
  }
}

/**
 * Checks asynchronously whether the given binary data is a valid ZIP archive.
 */
export async function isZipArchive(data: BinaryInput): Promise<boolean> {
  try {
    const bytes = await toUint8Array(data);
    return isZipArchiveSync(bytes);
  } catch {
    return false;
  }
}

/**
 * Lists all entries in a ZIP archive by inspecting central directory metadata
 * without decompressing file contents.
 *
 * @param data - The ZIP archive as Uint8Array, ArrayBuffer, Blob, or File.
 * @param options - Inspection options and security limits.
 * @returns Array of ZipEntryInfo objects.
 */
export async function listZipEntries(
  data: BinaryInput,
  options?: ZipInspectionOptions
): Promise<ZipEntryInfo[]> {
  const bytes = await toUint8Array(data);
  const parsed = parseCentralDirectory(bytes, options);
  return parsed.entries.map((entry) => ({
    path: entry.path,
    name: entry.name,
    isDirectory: entry.isDirectory,
    compressedSize: entry.compressedSize,
    uncompressedSize: entry.uncompressedSize,
    compressionMethod: entry.compressionMethod,
    lastModified: entry.lastModified,
    crc32: entry.crc32,
    comment: entry.comment,
    encrypted: entry.encrypted
  }));
}

/**
 * Gathers complete metadata and statistics of a ZIP archive without decompression.
 */
export async function getZipMetadata(data: BinaryInput): Promise<ZipMetadata> {
  const bytes = await toUint8Array(data);
  const parsed = parseCentralDirectory(bytes);

  const hasEncryptedEntries = parsed.entries.some((e) => e.encrypted);
  const ratio = calculateRatio(parsed.totalCompressedSize, parsed.totalUncompressedSize);

  return {
    isValid: true,
    entryCount: parsed.entries.length,
    totalCompressedSize: parsed.totalCompressedSize,
    totalUncompressedSize: parsed.totalUncompressedSize,
    compressionRatio: ratio,
    hasEncryptedEntries,
    comment: parsed.comment,
    entries: parsed.entries.map((e) => ({
      path: e.path,
      name: e.name,
      isDirectory: e.isDirectory,
      compressedSize: e.compressedSize,
      uncompressedSize: e.uncompressedSize,
      compressionMethod: e.compressionMethod,
      lastModified: e.lastModified,
      crc32: e.crc32,
      comment: e.comment,
      encrypted: e.encrypted
    }))
  };
}
