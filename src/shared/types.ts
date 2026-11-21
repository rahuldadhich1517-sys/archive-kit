/**
 * Error codes emitted by archive-kit.
 */
export type ArchiveKitErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_GZIP_DATA'
  | 'INVALID_ZIP_ARCHIVE'
  | 'UNSUPPORTED_COMPRESSION'
  | 'UNSUPPORTED_ENCRYPTION'
  | 'INVALID_ARCHIVE_PATH'
  | 'DUPLICATE_ENTRY'
  | 'ENTRY_LIMIT_EXCEEDED'
  | 'FILE_SIZE_LIMIT_EXCEEDED'
  | 'TOTAL_SIZE_LIMIT_EXCEEDED'
  | 'COMPRESSION_RATIO_LIMIT_EXCEEDED'
  | 'DECOMPRESSION_FAILED'
  | 'OPERATION_CANCELLED';

/**
 * Universal binary input accepted by all archive-kit APIs.
 */
export type BinaryInput = Uint8Array | ArrayBuffer | Blob | File;

/**
 * Standard ZIP compression method identifiers.
 */
export const ZIP_COMPRESSION_METHOD = {
  STORE: 0,
  SHRUNK: 1,
  REDUCED_1: 2,
  REDUCED_2: 3,
  REDUCED_3: 4,
  REDUCED_4: 5,
  IMPLODED: 6,
  DEFLATE: 8,
  DEFLATE64: 9,
  BZIP2: 12,
  LZMA: 14,
  ZSTD: 93,
  MP3: 94,
  XZ: 95,
  JPEG: 96,
  WAVPACK: 97,
  PPMD: 98,
  AES_ENCRYPTED: 99
} as const;

export type ZipCompressionMethod =
  (typeof ZIP_COMPRESSION_METHOD)[keyof typeof ZIP_COMPRESSION_METHOD];
