import {
  ArchiveKitError,
  DEFAULT_SECURITY_LIMITS,
  getBaseName,
  normalizeZipPath,
  validateCompressionRatio,
  validateDecompressedSize,
  validateEntryCount,
  validateTotalDecompressedSize
} from '../shared/index.js';
import type { ZipEntryInfo, ZipSecurityLimits } from './types.js';

export const SIG_LOC = 0x04034b50; // Local file header "PK\x03\x04"
export const SIG_CEN = 0x02014b50; // Central directory file header "PK\x01\x02"
export const SIG_EOCD = 0x06054b50; // End of central directory record "PK\x05\x06"

export function readU16LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

export function readU32LE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) |
      ((bytes[offset + 1] ?? 0) << 8) |
      ((bytes[offset + 2] ?? 0) << 16) |
      ((bytes[offset + 3] ?? 0) * 0x1000000)) >>>
    0
  );
}

function parseDosDateTime(dosTime: number, dosDate: number): Date {
  const year = ((dosDate >> 9) & 0x7f) + 1980;
  const month = ((dosDate >> 5) & 0x0f) - 1;
  const day = Math.max(1, dosDate & 0x1f);
  const hour = (dosTime >> 11) & 0x1f;
  const minute = (dosTime >> 5) & 0x3f;
  const second = (dosTime & 0x1f) * 2;
  return new Date(year, month, day, hour, minute, second);
}

/**
 * Searches backwards for the End of Central Directory (EOCD) signature.
 */
export function findEocd(data: Uint8Array): number {
  if (data.length < 22) return -1;
  const minOffset = Math.max(0, data.length - 65558);
  for (let i = data.length - 22; i >= minOffset; i--) {
    if (readU32LE(data, i) === SIG_EOCD) {
      return i;
    }
  }
  return -1;
}

export interface CentralDirectoryEntry extends ZipEntryInfo {
  localHeaderOffset: number;
}

export interface ParsedCentralDirectory {
  entries: CentralDirectoryEntry[];
  comment?: string;
  eocdOffset: number;
  totalCompressedSize: number;
  totalUncompressedSize: number;
}

/**
 * Parses the Central Directory of a ZIP archive in memory without decompressing file contents.
 */
export function parseCentralDirectory(
  data: Uint8Array,
  limits?: ZipSecurityLimits
): ParsedCentralDirectory {
  const eocd = findEocd(data);
  if (eocd === -1) {
    throw new ArchiveKitError(
      'INVALID_ZIP_ARCHIVE',
      'End of Central Directory (EOCD) record not found; data is not a valid ZIP archive'
    );
  }

  const totalEntries = readU16LE(data, eocd + 10);
  const cdOffset = readU32LE(data, eocd + 16);
  const commentLen = readU16LE(data, eocd + 20);

  let archiveComment: string | undefined;
  if (commentLen > 0 && eocd + 22 + commentLen <= data.length) {
    const commentBytes = data.subarray(eocd + 22, eocd + 22 + commentLen);
    try {
      archiveComment = new TextDecoder('utf-8', { fatal: false }).decode(commentBytes);
    } catch {
      archiveComment = String.fromCharCode(...commentBytes);
    }
  }

  const maxEntries = limits?.maxEntries ?? DEFAULT_SECURITY_LIMITS.maxEntries;
  validateEntryCount(totalEntries, maxEntries);

  if (cdOffset > data.length) {
    throw new ArchiveKitError(
      'INVALID_ZIP_ARCHIVE',
      `Corrupted ZIP archive: Central directory offset (${cdOffset}) points beyond archive bounds (${data.length})`
    );
  }

  const entries: CentralDirectoryEntry[] = [];
  const seenPaths = new Set<string>();
  let p = cdOffset;
  let totalComp = 0;
  let totalUncomp = 0;

  for (let i = 0; i < totalEntries; i++) {
    if (p + 46 > data.length) {
      throw new ArchiveKitError(
        'INVALID_ZIP_ARCHIVE',
        `Truncated Central Directory header at entry ${i}`
      );
    }

    const sig = readU32LE(data, p);
    if (sig !== SIG_CEN) {
      throw new ArchiveKitError(
        'INVALID_ZIP_ARCHIVE',
        `Invalid Central Directory signature 0x${sig.toString(16)} at offset ${p}`
      );
    }

    const flags = readU16LE(data, p + 8);
    const encrypted = (flags & 1) !== 0;
    const compressionMethod = readU16LE(data, p + 10);
    const dosTime = readU16LE(data, p + 12);
    const dosDate = readU16LE(data, p + 14);
    const lastModified = parseDosDateTime(dosTime, dosDate);
    const crc32 = readU32LE(data, p + 16);
    const compressedSize = readU32LE(data, p + 20);
    const uncompressedSize = readU32LE(data, p + 24);
    const fnLen = readU16LE(data, p + 28);
    const exLen = readU16LE(data, p + 30);
    const cmLen = readU16LE(data, p + 32);
    const localHeaderOffset = readU32LE(data, p + 42);

    const fnStart = p + 46;
    const fnEnd = fnStart + fnLen;
    if (fnEnd > data.length) {
      throw new ArchiveKitError(
        'INVALID_ZIP_ARCHIVE',
        `Truncated filename in Central Directory entry ${i}`
      );
    }

    const rawFnBytes = data.subarray(fnStart, fnEnd);
    let rawPath: string;
    try {
      rawPath = new TextDecoder('utf-8', { fatal: false }).decode(rawFnBytes);
    } catch {
      rawPath = String.fromCharCode(...rawFnBytes);
    }

    // Path normalization and Zip Slip / Traversal defense
    const normalizedPath = normalizeZipPath(rawPath);
    const isDirectory = rawPath.endsWith('/') || normalizedPath.endsWith('/');

    if (seenPaths.has(normalizedPath)) {
      throw new ArchiveKitError(
        'DUPLICATE_ENTRY',
        `Duplicate archive path detected: "${normalizedPath}"`
      );
    }
    seenPaths.add(normalizedPath);

    // Entry comment if present
    let entryComment: string | undefined;
    const cmStart = fnEnd + exLen;
    const cmEnd = cmStart + cmLen;
    if (cmLen > 0 && cmEnd <= data.length) {
      const cmBytes = data.subarray(cmStart, cmEnd);
      try {
        entryComment = new TextDecoder('utf-8', { fatal: false }).decode(cmBytes);
      } catch {
        entryComment = String.fromCharCode(...cmBytes);
      }
    }

    // Security validation on sizes
    validateDecompressedSize(uncompressedSize, limits?.maxEntrySize, normalizedPath);
    validateCompressionRatio(uncompressedSize, compressedSize, limits?.maxCompressionRatio, normalizedPath);

    totalComp += compressedSize;
    totalUncomp += uncompressedSize;
    validateTotalDecompressedSize(totalUncomp, limits?.maxTotalSize);

    entries.push({
      path: normalizedPath,
      name: getBaseName(normalizedPath),
      isDirectory,
      compressedSize,
      uncompressedSize,
      compressionMethod,
      lastModified,
      crc32,
      comment: entryComment,
      encrypted,
      localHeaderOffset
    });

    p = cmEnd;
  }

  return {
    entries,
    comment: archiveComment,
    eocdOffset: eocd,
    totalCompressedSize: totalComp,
    totalUncompressedSize: totalUncomp
  };
}

export interface LocalHeaderInfo {
  dataOffset: number;
  compressedSize: number;
  uncompressedSize: number;
  compressionMethod: number;
  crc32: number;
}

/**
 * Reads local file header directly before an entry payload.
 */
export function readLocalHeader(
  data: Uint8Array,
  localHeaderOffset: number
): LocalHeaderInfo {
  if (localHeaderOffset + 30 > data.length) {
    throw new ArchiveKitError(
      'INVALID_ZIP_ARCHIVE',
      `Truncated local file header at offset ${localHeaderOffset}`
    );
  }

  const sig = readU32LE(data, localHeaderOffset);
  if (sig !== SIG_LOC) {
    throw new ArchiveKitError(
      'INVALID_ZIP_ARCHIVE',
      `Expected local file header signature 0x04034b50 at offset ${localHeaderOffset}, found 0x${sig.toString(16)}`
    );
  }

  const compressionMethod = readU16LE(data, localHeaderOffset + 8);
  const crc32 = readU32LE(data, localHeaderOffset + 14);
  const compressedSize = readU32LE(data, localHeaderOffset + 18);
  const uncompressedSize = readU32LE(data, localHeaderOffset + 22);
  const fnLen = readU16LE(data, localHeaderOffset + 26);
  const exLen = readU16LE(data, localHeaderOffset + 28);

  const dataOffset = localHeaderOffset + 30 + fnLen + exLen;
  if (dataOffset > data.length) {
    throw new ArchiveKitError(
      'INVALID_ZIP_ARCHIVE',
      `Data offset ${dataOffset} extends beyond archive boundary (${data.length})`
    );
  }

  return {
    dataOffset,
    compressedSize,
    uncompressedSize,
    compressionMethod,
    crc32
  };
}
