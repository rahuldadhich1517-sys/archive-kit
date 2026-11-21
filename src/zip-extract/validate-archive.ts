import { toUint8Array, ZIP_COMPRESSION_METHOD, type BinaryInput } from '../shared/index.js';
import { parseCentralDirectory } from './parse.js';
import type { ZipValidationOptions, ZipValidationResult } from './types.js';

/**
 * Validates a ZIP archive thoroughly for structural integrity, unsupported features, and security violations.
 *
 * @param data - ZIP archive as Uint8Array, ArrayBuffer, Blob, or File.
 * @param options - Validation limits.
 * @returns Detailed validation result with errors and warnings.
 */
export async function validateZipArchive(
  data: BinaryInput,
  options?: ZipValidationOptions
): Promise<ZipValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let entryCount = 0;
  let totalComp = 0;
  let totalUncomp = 0;

  try {
    const bytes = await toUint8Array(data);
    const parsed = parseCentralDirectory(bytes, options);
    entryCount = parsed.entries.length;
    totalComp = parsed.totalCompressedSize;
    totalUncomp = parsed.totalUncompressedSize;

    for (const entry of parsed.entries) {
      if (entry.encrypted) {
        errors.push(`Entry "${entry.path}" is encrypted (unsupported format).`);
      }
      if (
        entry.compressionMethod !== ZIP_COMPRESSION_METHOD.STORE &&
        entry.compressionMethod !== ZIP_COMPRESSION_METHOD.DEFLATE
      ) {
        errors.push(
          `Entry "${entry.path}" uses unsupported compression method ${entry.compressionMethod}.`
        );
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    entryCount,
    totalCompressedSize: totalComp,
    totalUncompressedSize: totalUncomp
  };
}
