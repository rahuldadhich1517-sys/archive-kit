/**
 * Options for GZIP compression.
 */
export interface GzipCompressOptions {
  /**
   * Compression level between 0 (no compression / STORE) and 9 (maximum compression).
   * Default is 6.
   */
  level?: number;
  /**
   * Optional original filename to embed in the GZIP header.
   */
  filename?: string;
  /**
   * Optional modification date/time to embed in the GZIP header.
   */
  mtime?: Date | number;
  /**
   * Optional AbortSignal to cancel the operation.
   */
  signal?: AbortSignal;
}

/**
 * Options for GZIP decompression.
 */
export interface GzipDecompressOptions {
  /**
   * Optional AbortSignal to cancel the operation.
   */
  signal?: AbortSignal;
}

/**
 * Options for GZIP Blob compression.
 */
export interface GzipCompressBlobOptions extends GzipCompressOptions {
  /**
   * MIME type of the resulting Blob.
   * Default is "application/gzip".
   */
  mimeType?: string;
}

/**
 * Options for GZIP Blob decompression.
 */
export interface GzipDecompressBlobOptions extends GzipDecompressOptions {
  /**
   * MIME type of the resulting decompressed Blob.
   * Default is "application/octet-stream".
   */
  mimeType?: string;
}

/**
 * Metadata extracted from a GZIP header and trailer.
 */
export interface GzipMetadata {
  /**
   * Original uncompressed input size (mod 2^32 from GZIP trailer ISIZE), if present.
   */
  originalSize?: number;
  /**
   * Compressed size of the GZIP payload in bytes.
   */
  compressedSize: number;
  /**
   * Compression ratio (compressedSize / originalSize).
   */
  compressionRatio: number;
  /**
   * Percentage saved compared to original uncompressed size.
   */
  compressionPercentageSaved: number;
  /**
   * Embedded original filename from FNAME header, if present.
   */
  filename?: string;
  /**
   * Embedded comment from FCOMMENT header, if present.
   */
  comment?: string;
  /**
   * Embedded modification timestamp from MTIME header, if present.
   */
  mtime?: Date;
  /**
   * Operating system indicator byte from header.
   */
  os?: number;
  /**
   * Inferred MIME type.
   */
  mimeType?: string;
  /**
   * Suggested output filename.
   */
  outputFilename?: string;
}
