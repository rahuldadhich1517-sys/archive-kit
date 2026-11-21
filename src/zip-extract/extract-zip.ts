import { inflate } from 'fflate';
import {
  ArchiveKitError,
  computeCrc32,
  createBlob,
  decodeUtf8,
  normalizeZipPath,
  toUint8Array,
  validateDecompressedSize,
  validateTotalDecompressedSize,
  ZIP_COMPRESSION_METHOD,
  type BinaryInput
} from '../shared/index.js';
import {
  parseCentralDirectory,
  readLocalHeader,
  type CentralDirectoryEntry
} from './parse.js';
import type {
  ExtractedZipArchive,
  ExtractedZipEntry,
  ZipExtractOptions
} from './types.js';

function createExtractedEntry(
  entry: CentralDirectoryEntry,
  data: Uint8Array
): ExtractedZipEntry {
  return {
    path: entry.path,
    name: entry.name,
    isDirectory: entry.isDirectory,
    compressedSize: entry.compressedSize,
    uncompressedSize: entry.uncompressedSize,
    compressionMethod: entry.compressionMethod,
    lastModified: entry.lastModified,
    crc32: entry.crc32,
    comment: entry.comment,
    encrypted: entry.encrypted,
    data,
    text(): string {
      return decodeUtf8(this.data);
    },
    blob(mimeType = 'application/octet-stream'): Blob {
      return createBlob(this.data, mimeType);
    }
  };
}

async function decompressEntryPayload(
  archiveBytes: Uint8Array,
  entry: CentralDirectoryEntry,
  signal?: AbortSignal,
  maxEntrySize?: number
): Promise<Uint8Array> {
  if (signal?.aborted) {
    throw new ArchiveKitError('OPERATION_CANCELLED', 'Decompression was aborted');
  }

  if (entry.encrypted) {
    throw new ArchiveKitError(
      'UNSUPPORTED_ENCRYPTION',
      `Cannot extract encrypted entry "${entry.path}". Password/AES encryption is not supported.`
    );
  }

  if (entry.isDirectory) {
    return new Uint8Array(0);
  }

  const loc = readLocalHeader(archiveBytes, entry.localHeaderOffset);
  const compressedSize = entry.compressedSize || loc.compressedSize;
  const uncompressedSize = entry.uncompressedSize || loc.uncompressedSize;
  const method = entry.compressionMethod;

  const dataEnd = loc.dataOffset + compressedSize;
  if (dataEnd > archiveBytes.length) {
    throw new ArchiveKitError(
      'INVALID_ZIP_ARCHIVE',
      `Truncated compressed entry data for "${entry.path}"`
    );
  }

  const compressedData = archiveBytes.subarray(loc.dataOffset, dataEnd);

  // STORE (0)
  if (method === ZIP_COMPRESSION_METHOD.STORE) {
    validateDecompressedSize(compressedData.byteLength, maxEntrySize, entry.path);
    if (entry.crc32 !== undefined && entry.crc32 !== 0) {
      const actualCrc = computeCrc32(compressedData);
      if (actualCrc !== entry.crc32) {
        throw new ArchiveKitError(
          'DECOMPRESSION_FAILED',
          `CRC-32 checksum mismatch for STORE entry "${entry.path}": expected 0x${entry.crc32.toString(16)}, got 0x${actualCrc.toString(16)}`
        );
      }
    }
    return new Uint8Array(compressedData);
  }

  // DEFLATE (8)
  if (method === ZIP_COMPRESSION_METHOD.DEFLATE) {
    return new Promise<Uint8Array>((resolve, reject) => {
      let completed = false;

      if (signal) {
        signal.addEventListener('abort', () => {
          if (!completed) {
            completed = true;
            reject(new ArchiveKitError('OPERATION_CANCELLED', 'Decompression was aborted'));
          }
        });
      }

      inflate(compressedData, { size: uncompressedSize }, (err, result) => {
        if (completed) return;
        completed = true;
        if (err) {
          reject(
            new ArchiveKitError(
              'DECOMPRESSION_FAILED',
              `Failed to decompress DEFLATE entry "${entry.path}": ${err.message}`,
              err
            )
          );
          return;
        }

        // Validate actual uncompressed size against security limits
        try {
          validateDecompressedSize(result.byteLength, maxEntrySize, entry.path);
        } catch (e) {
          reject(e);
          return;
        }

        // Verify CRC-32 integrity
        if (entry.crc32 !== undefined && entry.crc32 !== 0) {
          const actualCrc = computeCrc32(result);
          if (actualCrc !== entry.crc32) {
            reject(
              new ArchiveKitError(
                'DECOMPRESSION_FAILED',
                `CRC-32 checksum mismatch for DEFLATE entry "${entry.path}": expected 0x${entry.crc32.toString(16)}, got 0x${actualCrc.toString(16)}`
              )
            );
            return;
          }
        }

        resolve(result);
      });
    });
  }

  throw new ArchiveKitError(
    'UNSUPPORTED_COMPRESSION',
    `Unsupported compression method (${method}) for entry "${entry.path}". Supported methods: STORE (0), DEFLATE (8).`
  );
}

/**
 * Extracts all or filtered entries from a ZIP archive.
 * Enforces strict Zip Slip protection, decompressed size limits, and CRC verification.
 *
 * @param data - ZIP archive as Uint8Array, ArrayBuffer, Blob, or File.
 * @param options - Extraction options including filter, security limits, and cancellation.
 * @returns Resolves to ExtractedZipArchive containing all extracted entries.
 */
export async function extractZip(
  data: BinaryInput,
  options?: ZipExtractOptions
): Promise<ExtractedZipArchive> {
  if (options?.signal?.aborted) {
    throw new ArchiveKitError('OPERATION_CANCELLED', 'Extraction was aborted');
  }

  const archiveBytes = await toUint8Array(data);
  const parsed = parseCentralDirectory(archiveBytes, options);

  const filter = options?.filter;
  const entriesToExtract = filter
    ? parsed.entries.filter((e) => filter(e))
    : parsed.entries;

  const extracted: ExtractedZipEntry[] = [];
  let totalExtractedBytes = 0;
  let fileCount = 0;
  let dirCount = 0;

  for (const entry of entriesToExtract) {
    if (options?.signal?.aborted) {
      throw new ArchiveKitError('OPERATION_CANCELLED', 'Extraction was aborted');
    }

    const payload = await decompressEntryPayload(
      archiveBytes,
      entry,
      options?.signal,
      options?.maxEntrySize
    );

    totalExtractedBytes += payload.byteLength;
    validateTotalDecompressedSize(totalExtractedBytes, options?.maxTotalSize);

    if (entry.isDirectory) {
      dirCount++;
    } else {
      fileCount++;
    }

    extracted.push(createExtractedEntry(entry, payload));
  }

  return {
    entries: extracted,
    totalFiles: fileCount,
    totalDirectories: dirCount,
    totalCompressedSize: parsed.totalCompressedSize,
    totalUncompressedSize: totalExtractedBytes,
    comment: parsed.comment
  };
}

/**
 * Selectively extracts a single entry from a ZIP archive by path without decompressing other entries.
 *
 * @param data - ZIP archive as Uint8Array, ArrayBuffer, Blob, or File.
 * @param path - Path of the target file to extract.
 * @param options - Extraction options.
 * @returns ExtractedZipEntry for the requested file.
 * @throws ArchiveKitError if file is not found or fails decompression.
 */
export async function extractZipEntry(
  data: BinaryInput,
  path: string,
  options?: ZipExtractOptions
): Promise<ExtractedZipEntry> {
  if (options?.signal?.aborted) {
    throw new ArchiveKitError('OPERATION_CANCELLED', 'Extraction was aborted');
  }

  const normalizedTarget = normalizeZipPath(path);
  const archiveBytes = await toUint8Array(data);
  const parsed = parseCentralDirectory(archiveBytes, options);

  const entry = parsed.entries.find((e) => e.path === normalizedTarget);
  if (!entry) {
    throw new ArchiveKitError(
      'INVALID_INPUT',
      `Entry "${normalizedTarget}" was not found in the ZIP archive`
    );
  }

  const payload = await decompressEntryPayload(
    archiveBytes,
    entry,
    options?.signal,
    options?.maxEntrySize
  );

  return createExtractedEntry(entry, payload);
}
