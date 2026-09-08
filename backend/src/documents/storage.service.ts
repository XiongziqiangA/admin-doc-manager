import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import {
  getNormalizedExtension,
  isAllowedDocumentFile,
  normalizeUploadedFileName,
} from "./document-file";

export interface StoredFile {
  storageKey: string;
  fileExt: string;
  checksum: string;
}

@Injectable()
export class StorageService {
  private readonly root: string;

  constructor(configService: ConfigService) {
    this.root = resolve(configService.get<string>("STORAGE_ROOT", "../storage"));
  }

  async saveDocumentFile(file: Express.Multer.File): Promise<StoredFile> {
    if (!file) {
      throw new BadRequestException("必须上传文件");
    }

    const originalFileName = normalizeUploadedFileName(file.originalname);
    if (!isAllowedDocumentFile(originalFileName)) {
      throw new BadRequestException("文件格式不支持");
    }

    const ext = getNormalizedExtension(originalFileName);
    const now = new Date();
    const storageKey = join(
      "documents",
      String(now.getFullYear()),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
      `${randomUUID()}${ext}`,
    ).replaceAll("\\", "/");
    const absolutePath = this.resolveStorageKey(storageKey);

    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, file.buffer);

    return {
      storageKey,
      fileExt: ext,
      checksum: createHash("sha256").update(file.buffer).digest("hex"),
    };
  }

  async createReadStream(storageKey: string) {
    const absolutePath = this.resolveStorageKey(storageKey);
    try {
      await stat(absolutePath);
    } catch {
      throw new NotFoundException("文件不存在");
    }

    return createReadStream(absolutePath);
  }

  async getStoredFilePath(storageKey: string) {
    const absolutePath = this.resolveStorageKey(storageKey);
    try {
      await stat(absolutePath);
    } catch {
      throw new NotFoundException("文件不存在");
    }

    return absolutePath;
  }

  async deleteDocumentFile(storageKey: string) {
    const absolutePath = this.resolveStorageKey(storageKey);
    try {
      await unlink(absolutePath);
      return true;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return false;
      }
      throw error;
    }
  }

  async deleteDocumentFiles(storageKeys: string[]) {
    let deletedCount = 0;
    for (const storageKey of [...new Set(storageKeys)]) {
      if (await this.deleteDocumentFile(storageKey)) {
        deletedCount += 1;
      }
    }
    return deletedCount;
  }

  private resolveStorageKey(storageKey: string): string {
    const absolutePath = resolve(this.root, storageKey);
    if (!absolutePath.startsWith(this.root)) {
      throw new BadRequestException("非法文件路径");
    }

    return absolutePath;
  }
}
