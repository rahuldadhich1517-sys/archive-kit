import type { ArchiveKitErrorCode } from './types.js';

/**
 * Custom error class for all archive-kit errors with typed codes and details.
 */
export class ArchiveKitError extends Error {
  readonly code: ArchiveKitErrorCode;
  readonly details?: unknown;

  constructor(code: ArchiveKitErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ArchiveKitError';
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, ArchiveKitError.prototype);
  }
}
