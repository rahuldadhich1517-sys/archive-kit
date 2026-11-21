import {
  ArchiveKitError,
  DEFAULT_SECURITY_LIMITS,
  normalizeZipPath,
  validateCompressionLevel,
  validateEntryCount
} from '../shared/index.js';
import type { ZipCreateOptions, ZipInputEntry } from './types.js';

/**
 * Merges user-provided ZIP creation options with safe production defaults.
 */
export function getZipCreateOptions(options?: Partial<ZipCreateOptions>): ZipCreateOptions {
  const compression = options?.compression ?? 'deflate';
  if (compression !== 'deflate' && compression !== 'store') {
    throw new ArchiveKitError(
      'INVALID_INPUT',
      `Invalid compression mode "${compression}". Must be "deflate" or "store".`
    );
  }

  const defaultLevel = compression === 'store' ? 0 : 6;
  const level = options?.compressionLevel !== undefined
    ? validateCompressionLevel(options.compressionLevel)
    : defaultLevel;

  return {
    compression,
    compressionLevel: level,
    maxEntries: options?.maxEntries ?? DEFAULT_SECURITY_LIMITS.maxEntries,
    maxTotalInputSize: options?.maxTotalInputSize ?? DEFAULT_SECURITY_LIMITS.maxTotalSize,
    signal: options?.signal,
    comment: options?.comment
  };
}

/**
 * Validates a list of ZIP input entries:
 * - Checks max entry count.
 * - Normalizes all paths and rejects Zip Slip, NUL bytes, and absolute paths.
 * - Detects and rejects duplicate paths.
 * - Validates per-entry compression levels if set.
 *
 * @throws ArchiveKitError if any entry is invalid or duplicate.
 */
export function validateZipEntries(
  entries: ZipInputEntry[],
  options?: ZipCreateOptions
): void {
  if (!Array.isArray(entries)) {
    throw new ArchiveKitError('INVALID_INPUT', 'Entries must be an array');
  }

  const maxEntries = options?.maxEntries ?? DEFAULT_SECURITY_LIMITS.maxEntries;
  validateEntryCount(entries.length, maxEntries);

  const seenPaths = new Set<string>();

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry || typeof entry !== 'object') {
      throw new ArchiveKitError('INVALID_INPUT', `Entry at index ${i} is not a valid object`);
    }

    if (!entry.path || typeof entry.path !== 'string') {
      throw new ArchiveKitError(
        'INVALID_ARCHIVE_PATH',
        `Entry at index ${i} must have a non-empty string path`
      );
    }

    const normalized = normalizeZipPath(entry.path);
    if (seenPaths.has(normalized)) {
      throw new ArchiveKitError(
        'DUPLICATE_ENTRY',
        `Duplicate archive path detected: "${normalized}"`
      );
    }
    seenPaths.add(normalized);

    if (entry.compressionLevel !== undefined) {
      validateCompressionLevel(entry.compressionLevel);
    }
  }
}
