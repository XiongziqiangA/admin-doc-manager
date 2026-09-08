import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import { writeZipArchive } from "./zip-writer";

class BufferWritable extends Writable {
  private readonly chunks: Buffer[] = [];

  _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.chunks.push(Buffer.from(chunk));
    callback();
  }

  toBuffer() {
    return Buffer.concat(this.chunks);
  }
}

describe("writeZipArchive", () => {
  it("writes a valid zip container with UTF-8 file names", async () => {
    const root = await mkdtemp(join(tmpdir(), "admin-docs-zip-"));
    const filePath = join(root, "source.txt");
    await writeFile(filePath, "hello");
    const output = new BufferWritable();

    await writeZipArchive(output, [
      { name: "其他资料/测试文件.txt", source: { type: "file", path: filePath } },
      { name: "导出清单.csv", source: { type: "buffer", buffer: Buffer.from("清单") } },
    ]);

    const zip = output.toBuffer();
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    expect(zip.includes(Buffer.from("其他资料/测试文件.txt"))).toBe(true);
    expect(zip.includes(Buffer.from("导出清单.csv"))).toBe(true);
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
  });
});
