import { describe, expect, it } from 'vitest';
import {
  ArchiveKitError,
  createZip,
  extractZip,
  extractZipEntry,
  listZipEntries,
  validateZipArchive
} from '../../src/index.js';

describe('Security & Threat Protection', () => {
  it('prevents Zip Slip path traversal during extraction (..)', async () => {
    // Manually construct or tamper a ZIP with Zip Slip path
    const validZip = await createZip([{ path: 'safe.txt', data: 'safe' }]);

    // Patch "safe.txt" to "../evil"
    const tampered = new Uint8Array(validZip);
    const safeBytes = new TextEncoder().encode('safe.txt');
    const evilBytes = new TextEncoder().encode('../evil');

    for (let i = 0; i < tampered.length - safeBytes.length; i++) {
      let match = true;
      for (let j = 0; j < safeBytes.length; j++) {
        if (tampered[i + j] !== safeBytes[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        tampered.set(evilBytes, i);
      }
    }

    await expect(extractZip(tampered)).rejects.toThrow(
      /Path traversal \("\.\."\) is strictly prohibited \(Zip Slip\)/
    );
    await expect(listZipEntries(tampered)).rejects.toThrow(ArchiveKitError);
  });

  it('prevents absolute root paths (/etc/passwd)', async () => {
    const validZip = await createZip([{ path: 'safe.txt', data: 'safe' }]);
    const tampered = new Uint8Array(validZip);
    const safeBytes = new TextEncoder().encode('safe.txt');
    const absBytes = new TextEncoder().encode('/etc/pwd');

    for (let i = 0; i < tampered.length - safeBytes.length; i++) {
      let match = true;
      for (let j = 0; j < safeBytes.length; j++) {
        if (tampered[i + j] !== safeBytes[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        tampered.set(absBytes, i);
      }
    }

    await expect(extractZip(tampered)).rejects.toThrow(/Absolute root paths are prohibited/);
  });

  it('prevents Windows drive-letter paths (C:/Windows/cmd.exe)', async () => {
    const validZip = await createZip([{ path: 'safe.txt', data: 'safe' }]);
    const tampered = new Uint8Array(validZip);
    const safeBytes = new TextEncoder().encode('safe.txt');
    const winBytes = new TextEncoder().encode('C:/win32');

    for (let i = 0; i < tampered.length - safeBytes.length; i++) {
      let match = true;
      for (let j = 0; j < safeBytes.length; j++) {
        if (tampered[i + j] !== safeBytes[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        tampered.set(winBytes, i);
      }
    }

    await expect(extractZip(tampered)).rejects.toThrow(
      /Absolute Windows drive paths are prohibited/
    );
  });

  it('prevents UNC network paths (//server/share)', async () => {
    const validZip = await createZip([{ path: 'safe.txt', data: 'safe' }]);
    const tampered = new Uint8Array(validZip);
    const safeBytes = new TextEncoder().encode('safe.txt');
    const uncBytes = new TextEncoder().encode('//server');

    for (let i = 0; i < tampered.length - safeBytes.length; i++) {
      let match = true;
      for (let j = 0; j < safeBytes.length; j++) {
        if (tampered[i + j] !== safeBytes[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        tampered.set(uncBytes, i);
      }
    }

    await expect(extractZip(tampered)).rejects.toThrow(/UNC network paths are prohibited/);
  });

  it('prevents NUL bytes in file names', async () => {
    const validZip = await createZip([{ path: 'safe.txt', data: 'safe' }]);
    const tampered = new Uint8Array(validZip);
    const safeBytes = new TextEncoder().encode('safe.txt');
    const nulBytes = new TextEncoder().encode('bad\0txt');

    for (let i = 0; i < tampered.length - safeBytes.length; i++) {
      let match = true;
      for (let j = 0; j < safeBytes.length; j++) {
        if (tampered[i + j] !== safeBytes[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        tampered.set(nulBytes, i);
      }
    }

    await expect(extractZip(tampered)).rejects.toThrow(/NUL byte/);
  });

  it('enforces per-entry decompressed size limit', async () => {
    const zipData = await createZip([
      { path: 'large.txt', data: 'A'.repeat(5000) }
    ]);

    await expect(
      extractZip(zipData, { maxEntrySize: 1000 })
    ).rejects.toThrow(/FILE_SIZE_LIMIT_EXCEEDED|decompressed size \(5000 bytes\) exceeds limit/);

    await expect(
      extractZipEntry(zipData, 'large.txt', { maxEntrySize: 1000 })
    ).rejects.toThrow(/decompressed size \(5000 bytes\) exceeds limit/);
  });

  it('enforces total aggregate decompressed size limit', async () => {
    const zipData = await createZip([
      { path: 'f1.txt', data: 'A'.repeat(600) },
      { path: 'f2.txt', data: 'B'.repeat(600) }
    ]);

    await expect(
      extractZip(zipData, { maxTotalSize: 1000 })
    ).rejects.toThrow(/TOTAL_SIZE_LIMIT_EXCEEDED|Total uncompressed size/);
  });

  it('enforces entry count limits', async () => {
    const zipData = await createZip([
      { path: 'f1.txt', data: '1' },
      { path: 'f2.txt', data: '2' },
      { path: 'f3.txt', data: '3' }
    ]);

    await expect(
      extractZip(zipData, { maxEntries: 2 })
    ).rejects.toThrow(/ENTRY_LIMIT_EXCEEDED|Archive entry count \(3\) exceeds/);
  });

  it('detects CRC-32 tampering on corrupted file payload', async () => {
    const zipData = await createZip([
      { path: 'secure.txt', data: 'Sensitive financial transaction payload' }
    ]);

    // Corrupt one byte of the compressed payload
    const tampered = new Uint8Array(zipData);
    tampered[45] = (tampered[45] ?? 0) ^ 0x01;

    await expect(extractZip(tampered)).rejects.toThrow(
      /Failed to decompress|CRC-32 checksum mismatch|DECOMPRESSION_FAILED/
    );
  });

  it('rejects encrypted entries with UNSUPPORTED_ENCRYPTION', async () => {
    const zipData = await createZip([{ path: 'secret.txt', data: 'password' }]);
    const tampered = new Uint8Array(zipData);

    // Set bit 0 of general purpose flag in Central Directory
    // Find central directory
    const cdOffset = zipData[zipData.length - 6] | (zipData[zipData.length - 5] << 8);
    tampered[cdOffset + 8] = (tampered[cdOffset + 8] ?? 0) | 1; // set encrypted bit

    await expect(extractZip(tampered)).rejects.toThrow(
      /UNSUPPORTED_ENCRYPTION|encrypted entry/
    );

    const verdict = await validateZipArchive(tampered);
    expect(verdict.valid).toBe(false);
    expect(verdict.errors.some((e) => e.includes('encrypted'))).toBe(true);
  });
});
