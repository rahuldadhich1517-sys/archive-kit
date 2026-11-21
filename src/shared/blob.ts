import { ArchiveKitError } from './errors.js';

/**
 * Creates a browser-compatible Blob from Uint8Array or array of chunks.
 */
export function createBlob(
  data: Uint8Array | Uint8Array[],
  mimeType = 'application/octet-stream'
): Blob {
  if (typeof Blob === 'undefined') {
    throw new ArchiveKitError(
      'INVALID_INPUT',
      'Blob API is not available in the current environment'
    );
  }
  const parts = Array.isArray(data) ? data : [data];
  return new Blob(parts as BlobPart[], { type: mimeType });
}

/**
 * Reads a Blob as Uint8Array.
 */
export async function readBlobAsUint8Array(blob: Blob): Promise<Uint8Array> {
  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
}
