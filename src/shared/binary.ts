import { ArchiveKitError } from './errors.js';
import type { BinaryInput } from './types.js';

/**
 * Converts any supported binary input into a Uint8Array.
 * Does not mutate caller-owned buffers.
 */
export async function toUint8Array(input: BinaryInput): Promise<Uint8Array> {
  if (input instanceof Uint8Array) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    const arrayBuffer = await input.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }
  throw new ArchiveKitError(
    'INVALID_INPUT',
    'Expected Uint8Array, ArrayBuffer, Blob, or File input'
  );
}

/**
 * Synchronous variant for Uint8Array or ArrayBuffer input.
 */
export function toUint8ArraySync(input: Uint8Array | ArrayBuffer): Uint8Array {
  if (input instanceof Uint8Array) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  throw new ArchiveKitError(
    'INVALID_INPUT',
    'Synchronous API requires Uint8Array or ArrayBuffer'
  );
}

/**
 * Converts Uint8Array or ArrayBuffer to ArrayBuffer.
 */
export function toArrayBuffer(input: Uint8Array | ArrayBuffer): ArrayBuffer {
  if (input instanceof ArrayBuffer) {
    return input;
  }
  if (input instanceof Uint8Array) {
    if (input.byteOffset === 0 && input.byteLength === input.buffer.byteLength) {
      return input.buffer as ArrayBuffer;
    }
    return input.buffer.slice(
      input.byteOffset,
      input.byteOffset + input.byteLength
    ) as ArrayBuffer;
  }
  throw new ArchiveKitError(
    'INVALID_INPUT',
    'Expected Uint8Array or ArrayBuffer'
  );
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

/**
 * Encodes text to UTF-8 bytes using browser-native TextEncoder.
 */
export function encodeUtf8(text: string): Uint8Array {
  if (typeof text !== 'string') {
    throw new ArchiveKitError('INVALID_INPUT', 'Expected string input');
  }
  return textEncoder.encode(text);
}

/**
 * Decodes UTF-8 bytes to text with strict verification (fatal: true).
 * Throws INVALID_INPUT if bytes are not valid UTF-8.
 */
export function decodeUtf8(bytes: Uint8Array): string {
  try {
    return textDecoder.decode(bytes);
  } catch (err) {
    throw new ArchiveKitError(
      'INVALID_INPUT',
      'Data is not valid UTF-8 text',
      err
    );
  }
}

/**
 * Concatenates multiple Uint8Arrays efficiently into one buffer.
 */
export function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  let totalLength = 0;
  for (let i = 0; i < arrays.length; i++) {
    const arr = arrays[i];
    if (arr) {
      totalLength += arr.length;
    }
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (let i = 0; i < arrays.length; i++) {
    const arr = arrays[i];
    if (arr) {
      result.set(arr, offset);
      offset += arr.length;
    }
  }
  return result;
}

/**
 * Compares two Uint8Arrays for byte-for-byte equality.
 */
export function compareUint8Arrays(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// Precomputed table for IEEE 802.3 CRC-32
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c >>> 0;
}

/**
 * Computes standard 32-bit CRC checksum for verifying ZIP entry integrity.
 */
export function computeCrc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    const byte = data[i] ?? 0;
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
