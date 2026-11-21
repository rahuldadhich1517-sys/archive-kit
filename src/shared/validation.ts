import { ArchiveKitError } from './errors.js';

export const DEFAULT_SECURITY_LIMITS = {
  maxEntries: 10_000,
  maxEntrySize: 250 * 1024 * 1024, // 250 MB
  maxTotalSize: 1024 * 1024 * 1024, // 1 GB
  maxCompressionRatio: 100, // 100:1 ratio protection against ZIP bombs
  maxInputSize: 1024 * 1024 * 1024 // 1 GB
} as const;

/**
 * Validates compression level (0-9).
 */
export function validateCompressionLevel(level?: number): number {
  if (level === undefined) return 6;
  if (!Number.isInteger(level) || level < 0 || level > 9) {
    throw new ArchiveKitError(
      'INVALID_INPUT',
      `Compression level must be an integer between 0 and 9, received: ${level}`
    );
  }
  return level;
}

/**
 * Validates maximum entry count.
 */
export function validateEntryCount(count: number, limit: number = DEFAULT_SECURITY_LIMITS.maxEntries): void {
  if (count > limit) {
    throw new ArchiveKitError(
      'ENTRY_LIMIT_EXCEEDED',
      `Archive entry count (${count}) exceeds the maximum limit of ${limit}`
    );
  }
}

/**
 * Validates per-entry decompressed size.
 */
export function validateDecompressedSize(
  size: number,
  limit: number = DEFAULT_SECURITY_LIMITS.maxEntrySize,
  path?: string
): void {
  if (size > limit) {
    throw new ArchiveKitError(
      'FILE_SIZE_LIMIT_EXCEEDED',
      `Entry ${path ? `"${path}" ` : ''}decompressed size (${size} bytes) exceeds limit of ${limit} bytes`
    );
  }
}

/**
 * Validates aggregate decompressed size.
 */
export function validateTotalDecompressedSize(
  size: number,
  limit: number = DEFAULT_SECURITY_LIMITS.maxTotalSize
): void {
  if (size > limit) {
    throw new ArchiveKitError(
      'TOTAL_SIZE_LIMIT_EXCEEDED',
      `Total uncompressed size (${size} bytes) exceeds maximum limit of ${limit} bytes`
    );
  }
}

/**
 * Validates compression ratio to prevent ZIP bombs.
 * Only enforced when uncompressed size is greater than 1MB to avoid false alarms on tiny files.
 */
export function validateCompressionRatio(
  uncompressed: number,
  compressed: number,
  maxRatio: number = DEFAULT_SECURITY_LIMITS.maxCompressionRatio,
  path?: string
): void {
  if (uncompressed > 1024 * 1024) {
    const ratio = uncompressed / Math.max(1, compressed);
    if (ratio > maxRatio) {
      throw new ArchiveKitError(
        'COMPRESSION_RATIO_LIMIT_EXCEEDED',
        `Compression ratio (${ratio.toFixed(1)}:1) for ${path ? `"${path}" ` : ''}exceeds safe threshold of ${maxRatio}:1`
      );
    }
  }
}

/**
 * Calculates compression ratio (compressed / original).
 */
export function calculateRatio(compressed: number, original: number): number {
  if (original <= 0) return 1;
  return Number((compressed / original).toFixed(4));
}

/**
 * Calculates percentage saved: (1 - compressed / original) * 100.
 */
export function calculatePercentageSaved(compressed: number, original: number): number {
  if (original <= 0) return 0;
  const saved = (1 - compressed / original) * 100;
  return Math.max(0, Number(saved.toFixed(2)));
}
