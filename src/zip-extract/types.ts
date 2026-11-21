/**
 * Metadata and properties of an entry inside a ZIP archive.
 */
export interface ZipEntryInfo {
  /**
   * Relative normalized path inside the archive.
   */
  path: string;
  /**
   * Filename or directory name component.
   */
  name: string;
  /**
   * True if entry is a directory (path ends with '/').
   */
  isDirectory: boolean;
  /**
   * Compressed payload size in bytes.
   */
  compressedSize: number;
  /**
   * Uncompressed payload size in bytes.
   */
  uncompressedSize: number;
  /**
   * Compression method (0 = STORE, 8 = DEFLATE).
   */
  compressionMethod: number;
  /**
   * Last modification timestamp if recorded in archive.
   */
  lastModified?: Date;
  /**
   * CRC-32 checksum from archive header.
   */
  crc32?: number;
  /**
   * Optional entry comment.
   */
  comment?: string;
  /**
   * True if entry is password/AES encrypted.
   */
  encrypted: boolean;
}

/**
 * An extracted entry containing decompressed data and helper methods.
 */
export interface ExtractedZipEntry extends ZipEntryInfo {
  /**
   * The decompressed binary content.
   */
  data: Uint8Array;
  /**
   * Decodes entry data as a UTF-8 text string.
   */
  text(): string;
  /**
   * Wraps entry data in a browser-native Blob.
   */
  blob(mimeType?: string): Blob;
}

/**
 * Result of extracting an entire ZIP archive or filtered subset.
 */
export interface ExtractedZipArchive {
  /**
   * List of extracted entries.
   */
  entries: ExtractedZipEntry[];
  /**
   * Total number of extracted files.
   */
  totalFiles: number;
  /**
   * Total number of extracted directories.
   */
  totalDirectories: number;
  /**
   * Aggregate compressed size in bytes.
   */
  totalCompressedSize: number;
  /**
   * Aggregate uncompressed size in bytes.
   */
  totalUncompressedSize: number;
  /**
   * Global archive comment, if present.
   */
  comment?: string;
}

/**
 * High-level metadata summary of a ZIP archive.
 */
export interface ZipMetadata {
  /**
   * True if archive is structurally valid.
   */
  isValid: boolean;
  /**
   * Total entry count in central directory.
   */
  entryCount: number;
  /**
   * Sum of compressed sizes of all entries.
   */
  totalCompressedSize: number;
  /**
   * Sum of uncompressed sizes of all entries.
   */
  totalUncompressedSize: number;
  /**
   * Global compression ratio (compressed / uncompressed).
   */
  compressionRatio: number;
  /**
   * True if any entry is marked encrypted.
   */
  hasEncryptedEntries: boolean;
  /**
   * Global archive comment.
   */
  comment?: string;
  /**
   * List of all entry summaries without decompression.
   */
  entries: ZipEntryInfo[];
}

/**
 * Detailed validation verdict for a ZIP archive.
 */
export interface ZipValidationResult {
  /**
   * True if archive passed all structural and security checks.
   */
  valid: boolean;
  /**
   * List of errors encountered (path traversal, corrupted headers, bombs).
   */
  errors: string[];
  /**
   * Non-critical warnings (e.g. unknown compression methods, unrecognized extra fields).
   */
  warnings: string[];
  /**
   * Number of entries inspected.
   */
  entryCount: number;
  /**
   * Total compressed size.
   */
  totalCompressedSize: number;
  /**
   * Total uncompressed size.
   */
  totalUncompressedSize: number;
}

/**
 * Security limits applied during inspection and extraction.
 */
export interface ZipSecurityLimits {
  /**
   * Maximum allowed entry count (default: 10,000).
   */
  maxEntries?: number;
  /**
   * Maximum allowed uncompressed size for any single entry in bytes (default: 250 MB).
   */
  maxEntrySize?: number;
  /**
   * Maximum allowed aggregate uncompressed size for all entries in bytes (default: 1 GB).
   */
  maxTotalSize?: number;
  /**
   * Maximum allowed compression ratio before rejecting as a zip bomb (default: 100:1).
   */
  maxCompressionRatio?: number;
  /**
   * Maximum archive input buffer size in bytes (default: 1 GB).
   */
  maxInputSize?: number;
}

/**
 * Options for inspecting archive entries.
 */
export interface ZipInspectionOptions extends ZipSecurityLimits {
  /**
   * Optional AbortSignal to cancel inspection.
   */
  signal?: AbortSignal;
}

/**
 * Options for extracting ZIP archives.
 */
export interface ZipExtractOptions extends ZipSecurityLimits {
  /**
   * Optional filter predicate to extract only matching entries.
   */
  filter?: (entry: ZipEntryInfo) => boolean;
  /**
   * Optional AbortSignal to cancel extraction.
   */
  signal?: AbortSignal;
}

/**
 * Options for archive validation.
 */
export type ZipValidationOptions = ZipSecurityLimits;
