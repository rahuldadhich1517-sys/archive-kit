import { zip, zipSync, type AsyncZippable, type Zippable } from 'fflate';
import {
  ArchiveKitError,
  createBlob,
  encodeUtf8,
  normalizeZipPath,
  toUint8Array,
  toUint8ArraySync,
  validateTotalDecompressedSize
} from '../shared/index.js';
import type {
  ZipCreateOptions,
  ZipFileInput,
  ZipInputEntry,
  ZipInputEntrySync
} from './types.js';
import { getZipCreateOptions, validateZipEntries } from './validate-entries.js';

async function resolveEntryBytes(
  entry: ZipInputEntry,
  signal?: AbortSignal
): Promise<Uint8Array> {
  if (signal?.aborted) {
    throw new ArchiveKitError('OPERATION_CANCELLED', 'ZIP creation was aborted');
  }

  const isDirectory = entry.type === 'directory' || entry.path.endsWith('/');
  if (isDirectory || entry.data === undefined || entry.data === null) {
    return new Uint8Array(0);
  }

  if (typeof entry.data === 'string') {
    return encodeUtf8(entry.data);
  }

  return toUint8Array(entry.data);
}

function resolveEntryBytesSync(entry: ZipInputEntrySync): Uint8Array {
  const isDirectory = entry.type === 'directory' || entry.path.endsWith('/');
  if (isDirectory || entry.data === undefined || entry.data === null) {
    return new Uint8Array(0);
  }

  if (typeof entry.data === 'string') {
    return encodeUtf8(entry.data);
  }

  return toUint8ArraySync(entry.data);
}

function appendZipComment(zipBytes: Uint8Array, comment?: string): Uint8Array {
  if (!comment) return zipBytes;
  const commentBytes = encodeUtf8(comment);
  if (commentBytes.length === 0 || commentBytes.length > 65535) return zipBytes;
  const out = new Uint8Array(zipBytes.length + commentBytes.length);
  out.set(zipBytes, 0);
  out[zipBytes.length - 2] = commentBytes.length & 0xff;
  out[zipBytes.length - 1] = (commentBytes.length >> 8) & 0xff;
  out.set(commentBytes, zipBytes.length);
  return out;
}

/**
 * Creates a ZIP archive Uint8Array asynchronously from a list of input entries.
 *
 * @param entries - Array of files and directories to include.
 * @param options - Configuration options (compression mode, level, limits, cancellation).
 * @returns Resolves to the complete ZIP archive Uint8Array.
 */
export async function createZip(
  entries: ZipInputEntry[],
  options?: ZipCreateOptions
): Promise<Uint8Array> {
  const opts = getZipCreateOptions(options);

  if (opts.signal?.aborted) {
    throw new ArchiveKitError('OPERATION_CANCELLED', 'ZIP creation was aborted');
  }

  validateZipEntries(entries, opts);

  const zippable: AsyncZippable = {};
  let totalInputSize = 0;

  for (const entry of entries) {
    if (opts.signal?.aborted) {
      throw new ArchiveKitError('OPERATION_CANCELLED', 'ZIP creation was aborted');
    }

    let normalizedPath = normalizeZipPath(entry.path);
    const isDir = entry.type === 'directory' || normalizedPath.endsWith('/');
    if (isDir && !normalizedPath.endsWith('/')) {
      normalizedPath = `${normalizedPath}/`;
    }

    const data = await resolveEntryBytes(entry, opts.signal);
    totalInputSize += data.byteLength;
    validateTotalDecompressedSize(totalInputSize, opts.maxTotalInputSize);

    const level =
      opts.compression === 'store'
        ? 0
        : (entry.compressionLevel ?? opts.compressionLevel ?? 6);

    const fileOpts = {
      level: level as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
      mtime: entry.lastModified
    };

    zippable[normalizedPath] = [data, fileOpts];
  }

  return new Promise<Uint8Array>((resolve, reject) => {
    let completed = false;

    if (opts.signal) {
      opts.signal.addEventListener('abort', () => {
        if (!completed) {
          completed = true;
          reject(new ArchiveKitError('OPERATION_CANCELLED', 'ZIP creation was aborted'));
        }
      });
    }

    zip(zippable, (err, result) => {
      if (completed) return;
      completed = true;
      if (err) {
        reject(
          new ArchiveKitError('INVALID_INPUT', `ZIP creation failed: ${err.message}`, err)
        );
      } else {
        resolve(appendZipComment(result, opts.comment));
      }
    });
  });
}

/**
 * Creates a ZIP archive synchronously for small in-memory workloads.
 *
 * @warning Calling this on large files will block the JavaScript main thread.
 */
export function createZipSync(
  entries: ZipInputEntrySync[],
  options?: ZipCreateOptions
): Uint8Array {
  const opts = getZipCreateOptions(options);
  validateZipEntries(entries as ZipInputEntry[], opts);

  const zippable: Zippable = {};
  let totalInputSize = 0;

  for (const entry of entries) {
    let normalizedPath = normalizeZipPath(entry.path);
    const isDir = entry.type === 'directory' || normalizedPath.endsWith('/');
    if (isDir && !normalizedPath.endsWith('/')) {
      normalizedPath = `${normalizedPath}/`;
    }

    const data = resolveEntryBytesSync(entry);
    totalInputSize += data.byteLength;
    validateTotalDecompressedSize(totalInputSize, opts.maxTotalInputSize);

    const level =
      opts.compression === 'store'
        ? 0
        : (entry.compressionLevel ?? opts.compressionLevel ?? 6);

    const fileOpts = {
      level: level as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
      mtime: entry.lastModified
    };

    zippable[normalizedPath] = [data, fileOpts];
  }

  try {
    const result = zipSync(zippable);
    return appendZipComment(result, opts.comment);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ArchiveKitError('INVALID_INPUT', `ZIP creation failed: ${message}`, err);
  }
}

/**
 * Creates a ZIP archive and returns it as a browser-compatible Blob.
 */
export async function createZipBlob(
  entries: ZipInputEntry[],
  options?: ZipCreateOptions
): Promise<Blob> {
  const bytes = await createZip(entries, options);
  return createBlob(bytes, 'application/zip');
}

/**
 * Creates a ZIP archive Blob directly from browser File objects,
 * automatically handling folder selection via webkitRelativePath.
 */
export async function createZipFromFiles(
  files: ZipFileInput[],
  options?: ZipCreateOptions
): Promise<Blob> {
  if (!Array.isArray(files)) {
    throw new ArchiveKitError('INVALID_INPUT', 'Expected an array of files');
  }

  const entries: ZipInputEntry[] = files.map((item) => {
    const file = item instanceof File ? item : item.file;
    // Support webkitRelativePath for directory uploads or custom path
    const path =
      (item as { path?: string }).path ||
      (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
      file.name;

    return {
      path,
      data: file,
      lastModified: new Date(file.lastModified)
    };
  });

  return createZipBlob(entries, options);
}
