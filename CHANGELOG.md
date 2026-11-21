# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-11-21

### Added
- **GZIP Compression & Decompression**:
  - `gzipCompress` and `gzipDecompress` supporting `Uint8Array`, `ArrayBuffer`, `Blob`, and `File`.
  - `gzipCompressText` and `gzipDecompressText` with strict UTF-8 validation.
  - `gzipCompressBlob` and `gzipDecompressBlob` for browser-native Blob workflows.
  - Synchronous variants: `gzipCompressSync`, `gzipDecompressSync`, `gzipCompressTextSync`, and `gzipDecompressTextSync`.
  - Signature detection: `isGzipData` and `isGzipDataSync`.
  - Comprehensive metadata parsing: `getGzipMetadata` and `getGzipMetadataSync` extracting original uncompressed size (ISIZE), compressed size, ratios, filename, comment, and timestamp.
  - Full trailer CRC-32 and ISIZE integrity verification to prevent corrupted decompression.

- **ZIP Archive Creation**:
  - `createZip` and `createZipBlob` supporting files, directories, text, Uint8Array, ArrayBuffer, and Blobs.
  - `createZipFromFiles` with automatic `webkitRelativePath` support for browser folder uploads.
  - STORE (uncompressed) and DEFLATE (configurable levels 0-9) compression modes.
  - Directory structure preservation and empty directory support.
  - Synchronous variant: `createZipSync`.
  - Entry validation: `validateZipEntries` and `getZipCreateOptions`.
  - Global archive comment embedding into End of Central Directory (EOCD).

- **ZIP Archive Extraction & Inspection**:
  - `listZipEntries`: Non-decompressing central directory inspection for instant file listings.
  - `extractZip`: Full archive extraction returning structured `ExtractedZipEntry` instances with `.text()` and `.blob()` helpers.
  - `extractZipEntry`: Selective single-entry decompression skipping unrelated archive entries.
  - `isZipArchive` and `isZipArchiveSync` signature detection.
  - `validateZipArchive` providing detailed structural, method, and security audits.
  - `getZipMetadata` summarizing archive stats, counts, and security indicators.

- **Security & Threat Mitigations**:
  - Zip Slip / path traversal rejection (detects and blocks `..`, absolute paths, Windows drive letters `C:`, UNC `//`, and NUL bytes).
  - Decompression bomb defenses (configurable compression ratio limits and decompressed byte tracking).
  - Configurable resource limits: `maxEntries`, `maxEntrySize`, `maxTotalSize`, and `maxInputSize`.
  - Verification of CRC-32 checksums on extraction.
  - Explicit rejection of unsupported encryption (passwords/AES) and unsupported compression algorithms.

- **Tooling & Architecture**:
  - Dual ESM and CommonJS exports with full TypeScript declaration maps (`.d.ts`, `.d.cts`).
  - Modular subpaths: `@rahul_dadhich15/archive-kit/gzip`, `@rahul_dadhich15/archive-kit/zip-create`, `@rahul_dadhich15/archive-kit/zip-extract`.
  - Single runtime dependency: `fflate`.
  - 100+ automated unit, integration, security, and Playwright real-browser tests.
