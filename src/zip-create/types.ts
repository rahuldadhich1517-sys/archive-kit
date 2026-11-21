import type { BinaryInput } from '../shared/index.js';

/**
 * An individual entry to include in a ZIP archive.
 */
export interface ZipInputEntry {
  /**
   * Relative path inside the archive (e.g. "documents/report.pdf" or "empty-folder/").
   */
  path: string;
  /**
   * Content of the entry. May be a UTF-8 string, Uint8Array, ArrayBuffer, Blob, or File.
   * Can be omitted or empty for directories.
   */
  data?: string | BinaryInput;
  /**
   * Last modified timestamp. Defaults to current date/time.
   */
  lastModified?: Date;
  /**
   * Explicit entry type ("file" | "directory").
   * Inferred from path ending with "/" if not specified.
   */
  type?: 'file' | 'directory';
  /**
   * Optional per-entry compression level override (0-9).
   */
  compressionLevel?: number;
}

/**
 * Synchronous variant of ZipInputEntry for small in-memory operations.
 */
export interface ZipInputEntrySync {
  path: string;
  data?: string | Uint8Array | ArrayBuffer;
  lastModified?: Date;
  type?: 'file' | 'directory';
  compressionLevel?: number;
}

/**
 * Configuration options for ZIP creation.
 */
export interface ZipCreateOptions {
  /**
   * Compression algorithm: "deflate" (compressed) or "store" (uncompressed).
   * Default is "deflate".
   */
  compression?: 'store' | 'deflate';
  /**
   * Global compression level from 0 (store) to 9 (maximum).
   * Default is 6 for deflate, 0 for store.
   */
  compressionLevel?: number;
  /**
   * Maximum allowed number of entries in the archive.
   * Default is 10,000.
   */
  maxEntries?: number;
  /**
   * Maximum total uncompressed size of all input entries in bytes.
   * Default is 1 GB (1,073,741,824 bytes).
   */
  maxTotalInputSize?: number;
  /**
   * AbortSignal to cancel the ZIP creation.
   */
  signal?: AbortSignal;
  /**
   * Optional global archive comment.
   */
  comment?: string;
}

/**
 * File input item accepted by createZipFromFiles.
 */
export type ZipFileInput = File | { file: File; path?: string };
