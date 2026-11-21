import { ArchiveKitError } from './errors.js';

/**
 * Normalizes an archive path according to ZIP standards and enforces security:
 * - Converts backslashes to forward slashes.
 * - Rejects NUL characters.
 * - Rejects absolute paths (leading slash, Windows drive letters, UNC paths).
 * - Rejects Zip Slip path traversal ('..' segments).
 * - Removes leading './'.
 * - Preserves trailing slashes for directories.
 */
export function normalizeZipPath(rawPath: string): string {
  if (!rawPath || typeof rawPath !== 'string') {
    throw new ArchiveKitError(
      'INVALID_ARCHIVE_PATH',
      'Archive path must be a non-empty string'
    );
  }

  // Reject NUL characters
  if (rawPath.includes('\0')) {
    throw new ArchiveKitError(
      'INVALID_ARCHIVE_PATH',
      `Archive path contains NUL byte: "${rawPath}"`
    );
  }

  // Normalize all backslashes to forward slashes
  const path = rawPath.replace(/\\/g, '/');

  // Check for absolute Windows drive letter (e.g. C:/ or C:\)
  if (/^[a-zA-Z]:/i.test(path)) {
    throw new ArchiveKitError(
      'INVALID_ARCHIVE_PATH',
      `Absolute Windows drive paths are prohibited: "${rawPath}"`
    );
  }

  // Check for UNC path (e.g. //server/share)
  if (path.startsWith('//')) {
    throw new ArchiveKitError(
      'INVALID_ARCHIVE_PATH',
      `UNC network paths are prohibited: "${rawPath}"`
    );
  }

  // Check for root-relative absolute path
  if (path.startsWith('/')) {
    throw new ArchiveKitError(
      'INVALID_ARCHIVE_PATH',
      `Absolute root paths are prohibited: "${rawPath}"`
    );
  }

  // Preserve directory indicator if original path ended with slash
  const isDirectory = path.endsWith('/');

  // Split into segments and validate
  const segments = path.split('/');
  const cleaned: string[] = [];

  for (const seg of segments) {
    if (seg === '' || seg === '.') {
      continue;
    }
    if (seg === '..') {
      throw new ArchiveKitError(
        'INVALID_ARCHIVE_PATH',
        `Path traversal ("..") is strictly prohibited (Zip Slip): "${rawPath}"`
      );
    }
    cleaned.push(seg);
  }

  if (cleaned.length === 0) {
    throw new ArchiveKitError(
      'INVALID_ARCHIVE_PATH',
      `Path resolved to an empty path: "${rawPath}"`
    );
  }

  const result = cleaned.join('/');
  return isDirectory ? `${result}/` : result;
}

/**
 * Checks whether an archive path designates a directory.
 */
export function isDirPath(path: string): boolean {
  return path.endsWith('/');
}

/**
 * Returns the file name component of a path.
 */
export function getBaseName(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash === -1 ? normalized : normalized.slice(lastSlash + 1);
}

/**
 * Returns the parent directory path.
 */
export function getDirName(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash === -1 ? '' : normalized.slice(0, lastSlash);
}
