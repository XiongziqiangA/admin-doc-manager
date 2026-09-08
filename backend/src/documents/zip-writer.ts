import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Writable } from "node:stream";
import { once } from "node:events";

export interface ZipEntry {
  name: string;
  date?: Date;
  source:
    | { type: "file"; path: string }
    | { type: "buffer"; buffer: Buffer };
}

interface CentralDirectoryEntry {
  nameBuffer: Buffer;
  crc32: number;
  size: number;
  dosTime: number;
  dosDate: number;
  localHeaderOffset: number;
}

const CRC32_TABLE = buildCrc32Table();

export async function writeZipArchive(output: Writable, entries: ZipEntry[]) {
  const centralDirectory: CentralDirectoryEntry[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(normalizeZipEntryName(entry.name), "utf8");
    const { size, crc32 } = await getEntryStats(entry);
    const { dosTime, dosDate } = toDosDateTime(entry.date ?? new Date());
    const localHeaderOffset = offset;
    const localHeader = createLocalFileHeader(nameBuffer, crc32, size, dosTime, dosDate);

    await writeBuffer(output, localHeader);
    offset += localHeader.length;
    await writeEntrySource(output, entry);
    offset += size;
    centralDirectory.push({ nameBuffer, crc32, size, dosTime, dosDate, localHeaderOffset });
  }

  const centralDirectoryOffset = offset;
  for (const entry of centralDirectory) {
    const header = createCentralDirectoryHeader(entry);
    await writeBuffer(output, header);
    offset += header.length;
  }
  const centralDirectorySize = offset - centralDirectoryOffset;
  await writeBuffer(output, createEndOfCentralDirectory(centralDirectory.length, centralDirectorySize, centralDirectoryOffset));
  output.end();
}

function createLocalFileHeader(nameBuffer: Buffer, crc32: number, size: number, dosTime: number, dosDate: number) {
  assertZip32Size(size);
  const header = Buffer.alloc(30 + nameBuffer.length);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(dosTime, 10);
  header.writeUInt16LE(dosDate, 12);
  header.writeUInt32LE(crc32, 14);
  header.writeUInt32LE(size, 18);
  header.writeUInt32LE(size, 22);
  header.writeUInt16LE(nameBuffer.length, 26);
  header.writeUInt16LE(0, 28);
  nameBuffer.copy(header, 30);
  return header;
}

function createCentralDirectoryHeader(entry: CentralDirectoryEntry) {
  assertZip32Size(entry.size);
  assertZip32Size(entry.localHeaderOffset);
  const header = Buffer.alloc(46 + entry.nameBuffer.length);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(entry.dosTime, 12);
  header.writeUInt16LE(entry.dosDate, 14);
  header.writeUInt32LE(entry.crc32, 16);
  header.writeUInt32LE(entry.size, 20);
  header.writeUInt32LE(entry.size, 24);
  header.writeUInt16LE(entry.nameBuffer.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(entry.localHeaderOffset, 42);
  entry.nameBuffer.copy(header, 46);
  return header;
}

function createEndOfCentralDirectory(entryCount: number, centralDirectorySize: number, centralDirectoryOffset: number) {
  if (entryCount > 0xffff) {
    throw new Error("ZIP 文件数量超出当前导出能力");
  }
  assertZip32Size(centralDirectorySize);
  assertZip32Size(centralDirectoryOffset);
  const header = Buffer.alloc(22);
  header.writeUInt32LE(0x06054b50, 0);
  header.writeUInt16LE(0, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(entryCount, 8);
  header.writeUInt16LE(entryCount, 10);
  header.writeUInt32LE(centralDirectorySize, 12);
  header.writeUInt32LE(centralDirectoryOffset, 16);
  header.writeUInt16LE(0, 20);
  return header;
}

async function getEntryStats(entry: ZipEntry) {
  if (entry.source.type === "buffer") {
    return {
      size: entry.source.buffer.length,
      crc32: calculateBufferCrc32(entry.source.buffer),
    };
  }

  const fileStat = await stat(entry.source.path);
  return {
    size: fileStat.size,
    crc32: await calculateFileCrc32(entry.source.path),
  };
}

async function writeEntrySource(output: Writable, entry: ZipEntry) {
  if (entry.source.type === "buffer") {
    await writeBuffer(output, entry.source.buffer);
    return;
  }

  const stream = createReadStream(entry.source.path);
  for await (const chunk of stream) {
    await writeBuffer(output, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
}

async function calculateFileCrc32(path: string) {
  let crc = 0xffffffff;
  const stream = createReadStream(path);
  for await (const chunk of stream) {
    crc = updateCrc32(crc, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function calculateBufferCrc32(buffer: Buffer) {
  return (updateCrc32(0xffffffff, buffer) ^ 0xffffffff) >>> 0;
}

function updateCrc32(crc: number, buffer: Buffer) {
  let next = crc;
  for (const byte of buffer) {
    next = CRC32_TABLE[(next ^ byte) & 0xff] ^ (next >>> 8);
  }
  return next >>> 0;
}

function buildCrc32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
}

async function writeBuffer(output: Writable, buffer: Buffer) {
  if (!output.write(buffer)) {
    await once(output, "drain");
  }
}

function normalizeZipEntryName(name: string) {
  return name.replaceAll("\\", "/").replace(/^\/+/, "");
}

function toDosDateTime(date: Date) {
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);
  return {
    dosTime: (hours << 11) | (minutes << 5) | seconds,
    dosDate: ((year - 1980) << 9) | (month << 5) | day,
  };
}

function assertZip32Size(size: number) {
  if (size > 0xffffffff) {
    throw new Error("单次导出文件过大，请拆分后导出");
  }
}
