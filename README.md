# @rahul_dadhich15/archive-kit

[![CI](https://github.com/rahuldadhich1517-sys/archive-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/rahuldadhich1517-sys/archive-kit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue.svg)](https://www.typescriptlang.org/)

Production-ready, browser-first archive and compression toolkit containing three standalone file utilities: **GZIP compression/decompression**, **ZIP archive creation**, and **ZIP archive extraction & inspection**.

Engineered specifically for local in-browser file processing (e.g. React, Vite, Next.js, standard web applications) and Node.js environments. All compression, decompression, and inspection happen **locally on the client** without backends, external APIs, telemetry, or remote services.

---

## Features

- 🔒 **100% Client-Side Local Processing**: Zero network requests, zero remote processing, zero server dependency.
- ⚡ **Single Lightweight Runtime Dependency**: Powered exclusively by [`fflate`](https://github.com/101arrowz/fflate) for blazing-fast DEFLATE execution.
- 📦 **Modular & Tree-Shakeable**: Import only what you need from the root or dedicated subpaths (`/gzip`, `/zip-create`, `/zip-extract`).
- 🛡️ **Hardened Security**:
  - Full Zip Slip / path traversal protection (`..`, absolute paths, Windows drive letters `C:`, UNC `//`, NUL bytes).
  - Decompression bomb defenses (compression ratio checks and live extracted byte accounting).
  - Configurable resource limits (`maxEntries`, `maxEntrySize`, `maxTotalSize`, `maxCompressionRatio`).
  - Strict CRC-32 and ISIZE integrity verification.
- 🌐 **Browser-Native**: Native support for `File`, `Blob`, `ArrayBuffer`, and `Uint8Array`.
- 📁 **Folder Structure Preservation**: Automatic relative path resolution for folder uploads (`webkitRelativePath`).
- 🔎 **Instant Non-Extracting Inspection**: Inspect archive file lists and metadata directly from the Central Directory without decompressing payload bytes.
- 🎯 **Selective Extraction**: Extract individual files on-demand without decompressing the rest of the archive.
- 📘 **TypeScript-First**: Strict TypeScript declarations and JSDoc documentation for all public APIs.
- 🔄 **Dual ESM & CommonJS**: Full support for standard ESM (`import`) and CommonJS (`require`).

---

## Installation

```bash
npm install @rahul_dadhich15/archive-kit
```

Or with yarn / pnpm / bun:

```bash
yarn add @rahul_dadhich15/archive-kit
pnpm add @rahul_dadhich15/archive-kit
bun add @rahul_dadhich15/archive-kit
```

---

## Import Options

You can import utilities from the primary root package:

```ts
import {
  gzipCompress,
  gzipDecompress,
  createZip,
  createZipFromFiles,
  listZipEntries,
  extractZip,
  extractZipEntry
} from '@rahul_dadhich15/archive-kit';
```

Or import from standalone subpaths for optimal bundle tree-shaking:

```ts
// GZIP only
import { gzipCompressText, gzipDecompressText } from '@rahul_dadhich15/archive-kit/gzip';

// ZIP Creation only
import { createZip, createZipBlob } from '@rahul_dadhich15/archive-kit/zip-create';

// ZIP Extraction only
import { listZipEntries, extractZip } from '@rahul_dadhich15/archive-kit/zip-extract';
```

---

## Usage Guide

### 1. GZIP Utility (`/gzip`)

Compress and decompress data locally using standard RFC 1952 GZIP format.

#### Text Compression & Decompression

```ts
import { gzipCompressText, gzipDecompressText } from '@rahul_dadhich15/archive-kit/gzip';

const originalText = 'Hello, local browser compression!';

// Compress string to Uint8Array
const compressed = await gzipCompressText(originalText, { level: 6 });

// Decompress Uint8Array directly back to string
const recovered = await gzipDecompressText(compressed);
console.log(recovered); // "Hello, local browser compression!"
```

#### Binary Data Compression

```ts
import { gzipCompress, gzipDecompress } from '@rahul_dadhich15/archive-kit/gzip';

const rawBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

// Accepts Uint8Array, ArrayBuffer, Blob, or File
const compressed = await gzipCompress(rawBytes, {
  level: 9, // 0 = STORE (no compression), 9 = Maximum
  filename: 'data.bin',
  mtime: new Date()
});

const decompressed = await gzipDecompress(compressed);
```

#### Browser Blob Compression & Download Preparation

```ts
import { gzipCompressBlob, gzipDecompressBlob } from '@rahul_dadhich15/archive-kit/gzip';

const fileInput = document.querySelector('input[type="file"]').files[0];

// Compresses to a browser-ready Blob with MIME type "application/gzip"
const compressedBlob = await gzipCompressBlob(fileInput);

// Create download link in browser UI
const downloadUrl = URL.createObjectURL(compressedBlob);
const link = document.createElement('a');
link.href = downloadUrl;
link.download = `${fileInput.name}.gz`;
link.click();
URL.revokeObjectURL(downloadUrl);
```

#### GZIP Metadata & Verification

```ts
import { isGzipData, getGzipMetadata } from '@rahul_dadhich15/archive-kit/gzip';

if (await isGzipData(fileBuffer)) {
  const metadata = await getGzipMetadata(fileBuffer);
  console.log(`Original size: ${metadata.originalSize} bytes`);
  console.log(`Compressed size: ${metadata.compressedSize} bytes`);
  console.log(`Saved: ${metadata.compressionPercentageSaved}%`);
  console.log(`Embedded filename: ${metadata.filename}`);
}
```

---

### 2. ZIP Creation Utility (`/zip-create`)

Create standard ZIP archives from files, folders, Blobs, and in-memory data.

#### Create ZIP from Files and Nested Folders

```ts
import { createZip, createZipBlob } from '@rahul_dadhich15/archive-kit/zip-create';

const entries = [
  { path: 'README.md', data: '# My Project\nCreated in browser.' },
  { path: 'src/index.js', data: 'console.log("Hello World");' },
  { path: 'assets/logo.png', data: imageUint8Array },
  { path: 'empty-folder/', type: 'directory' } // Creates empty directory entry
];

// Asynchronously generates ZIP Uint8Array
const zipBytes = await createZip(entries, {
  compression: 'deflate', // "deflate" or "store"
  compressionLevel: 6,     // 0-9
  comment: 'Created with archive-kit'
});

// Or generate an application/zip Blob ready for download
const zipBlob = await createZipBlob(entries);
```

#### Create ZIP Directly from Browser `<input type="file">`

Supports single files, multiple files, and full folder uploads (`webkitdirectory`):

```ts
import { createZipFromFiles } from '@rahul_dadhich15/archive-kit/zip-create';

const fileInputElement = document.querySelector('input[type="file"]');
const files = Array.from(fileInputElement.files);

// Automatically preserves folder hierarchies via webkitRelativePath
const zipBlob = await createZipFromFiles(files);

// Trigger client download
const url = URL.createObjectURL(zipBlob);
const a = document.createElement('a');
a.href = url;
a.download = 'archive.zip';
a.click();
URL.revokeObjectURL(url);
```

---

### 3. ZIP Extraction & Inspection Utility (`/zip-extract`)

Inspect and extract ZIP archives locally with strict security controls against malicious files.

#### Inspect File List Without Decompressing (`listZipEntries`)

Scans only the ZIP Central Directory in memory without allocating decompressed files:

```ts
import { listZipEntries } from '@rahul_dadhich15/archive-kit/zip-extract';

const entries = await listZipEntries(zipFile);

for (const entry of entries) {
  console.log(`File: ${entry.path}`);
  console.log(`Compressed: ${entry.compressedSize} B`);
  console.log(`Uncompressed: ${entry.uncompressedSize} B`);
  console.log(`Is Directory: ${entry.isDirectory}`);
  console.log(`Method: ${entry.compressionMethod === 8 ? 'DEFLATE' : 'STORE'}`);
}
```

#### Extract Entire Archive

```ts
import { extractZip } from '@rahul_dadhich15/archive-kit/zip-extract';

const archive = await extractZip(zipData, {
  maxEntries: 5000,
  maxTotalSize: 500 * 1024 * 1024 // 500 MB max total decompressed size
});

console.log(`Extracted ${archive.totalFiles} files and ${archive.totalDirectories} directories.`);

for (const entry of archive.entries) {
  if (entry.isDirectory) continue;

  // Convenient helper methods:
  const textContent = entry.text();            // Decode as UTF-8 string
  const blob = entry.blob('image/png');         // Wrap in Blob for browser display/download
  const rawBytes = entry.data;                 // Raw Uint8Array
}
```

#### Selective Extraction (`extractZipEntry`)

Decompress only the single requested file while skipping all other entries:

```ts
import { extractZipEntry } from '@rahul_dadhich15/archive-kit/zip-extract';

// Only decompresses "documents/report.pdf", leaving all other files compressed
const entry = await extractZipEntry(zipData, 'documents/report.pdf');
const pdfBlob = entry.blob('application/pdf');
```

#### Archive Validation & Integrity Check

```ts
import { validateZipArchive } from '@rahul_dadhich15/archive-kit/zip-extract';

const verdict = await validateZipArchive(userProvidedBuffer);

if (!verdict.valid) {
  console.error('Archive rejected:', verdict.errors);
} else {
  console.log(`Valid archive containing ${verdict.entryCount} entries.`);
}
```

---

## Security Safeguards

Processing untrusted user archives in the client introduces risks that `archive-kit` defends against by default:

| Security Threat | Mitigation in `archive-kit` | Error Emitted |
| :--- | :--- | :--- |
| **Zip Slip / Path Traversal** | Rejects `..` path traversal, absolute paths (`/`), Windows drive paths (`C:`), UNC paths (`//`), and NUL bytes (`\0`). | `INVALID_ARCHIVE_PATH` |
| **Decompression Bombs (Zip Bombs)** | Enforces live aggregate byte limits and validates compression ratios (default maximum ratio 100:1). | `COMPRESSION_RATIO_LIMIT_EXCEEDED` / `TOTAL_SIZE_LIMIT_EXCEEDED` |
| **Oversized Entries** | Enforces per-entry decompressed size ceiling (default 250 MB). | `FILE_SIZE_LIMIT_EXCEEDED` |
| **Excessive Entry Counts** | Limits maximum archive entries (default 10,000 entries). | `ENTRY_LIMIT_EXCEEDED` |
| **Data Corruption** | Verifies 32-bit CRC checksums and GZIP ISIZE against decompressed buffers. | `DECOMPRESSION_FAILED` |
| **Unsupported Encryption** | Rejects password-protected or AES-encrypted entries rather than returning corrupted plaintext. | `UNSUPPORTED_ENCRYPTION` |
| **Arbitrary Code Execution** | Operates strictly in memory; never executes extracted scripts or writes to the OS filesystem. | N/A |

### Customizing Security Limits

All limits can be adjusted to match your application's constraints:

```ts
const archive = await extractZip(zipData, {
  maxEntries: 1_000,              // Max allowed entries
  maxEntrySize: 50 * 1024 * 1024,  // 50 MB max per file
  maxTotalSize: 200 * 1024 * 1024, // 200 MB max aggregate decompressed size
  maxCompressionRatio: 50         // Reject if ratio > 50:1
});
```

---

## Synchronous APIs

For small in-memory operations where an asynchronous Promise is unnecessary, synchronous equivalents are provided:

- `gzipCompressSync(data, options?)`
- `gzipDecompressSync(data, options?)`
- `gzipCompressTextSync(text, options?)`
- `gzipDecompressTextSync(data, options?)`
- `isGzipDataSync(data)`
- `getGzipMetadataSync(data)`
- `createZipSync(entries, options?)`
- `isZipArchiveSync(data)`

> **Warning**: Synchronous APIs run on the JavaScript main thread. For larger files (>5 MB) in browser applications, always use the asynchronous APIs to avoid UI freezes.

---

## Cancellation Support

All asynchronous operations accept an optional `AbortSignal`:

```ts
const controller = new AbortController();

// Cancel when user clicks "Cancel" in your React UI
cancelButton.addEventListener('click', () => controller.abort());

try {
  const result = await createZip(largeFileList, { signal: controller.signal });
} catch (err) {
  if (err.code === 'OPERATION_CANCELLED') {
    console.log('User cancelled archive creation');
  }
}
```

---

## Known Limitations

- **Compression Methods**: Supports standard ZIP **STORE** (`0`) and **DEFLATE** (`8`). Proprietary or legacy algorithms (e.g. BZIP2, LZMA, PPMd, Zstandard) are rejected with `UNSUPPORTED_COMPRESSION`.
- **Encryption**: Password-protected and AES-encrypted archives are not supported and are safely rejected with `UNSUPPORTED_ENCRYPTION`.
- **Archive Size**: Standard ZIP format supports archives up to 4 GB (2^32 bytes). ZIP64 extensions and multi-volume spanned archives are not supported.
- **Browser Memory Limits**: All processing takes place within browser tab memory (ArrayBuffers and Blobs). Modern browser tabs typically handle archives up to 500 MB – 1 GB before encountering V8 heap exhaustion.

---

## Development & Testing

```bash
# Install dependencies
npm install

# Run TypeScript typecheck
npm run typecheck

# Run ESLint
npm run lint

# Run Vitest unit, integration, and security tests
npm run test

# Run test coverage audit (enforces 90% lines/statements, 80% branches)
npm run test:coverage

# Run real-browser Playwright tests in headless Chromium
npm run test:browser

# Run smoke test on built artifacts
npm run test:smoke

# Run full consumer sandbox verification pipeline
npm run test:consumer

# Build production distribution
npm run build
```

---

## License

[MIT](LICENSE) © 2026 Rahul Dadhich
