import { BadRequestException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaService } from "../prisma/prisma.service";
import { CategoriesService } from "./categories.service";

describe("CategoriesService", () => {
  const prisma = {
    category: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    document: {
      count: vi.fn(),
    },
  };

  let service: CategoriesService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CategoriesService(prisma as unknown as PrismaService);
  });

  it("creates a primary category with a normalized document number prefix", async () => {
    prisma.category.findUnique.mockResolvedValue(null);
    prisma.category.create.mockResolvedValue({ id: "cat-1", name: "Custom", code: "XZ", level: 1 });

    await service.create({ name: "Custom", code: " xz ", sort: 3 });

    expect(prisma.category.create).toHaveBeenCalledWith({
      data: {
        name: "Custom",
        code: "XZ",
        parentId: null,
        level: 1,
        isSystem: false,
        sort: 3,
      },
    });
  });

  it("allows administrators to update system primary category names and codes", async () => {
    prisma.category.findFirst.mockResolvedValue({
      id: "cat-1",
      name: "Old",
      code: "OLD",
      level: 1,
      isSystem: true,
      parentId: null,
    });
    prisma.category.findUnique.mockResolvedValue(null);
    prisma.category.update.mockResolvedValue({ id: "cat-1", name: "New", code: "NEW" });

    await service.update("cat-1", { name: "New", code: " new ", sort: 2 });

    expect(prisma.category.update).toHaveBeenCalledWith({
      where: { id: "cat-1" },
      data: {
        name: "New",
        code: "NEW",
        sort: 2,
      },
    });
  });

  it("creates a child category under an existing second-level category", async () => {
    prisma.category.findFirst.mockResolvedValue({
      id: "cat-2",
      name: "Secondary",
      level: 2,
      isSystem: false,
      parentId: "cat-1",
    });
    prisma.category.create.mockResolvedValue({ id: "cat-3", name: "Third", level: 3 });

    await service.create({ name: "Third", parentId: "cat-2", sort: 1 });

    expect(prisma.category.create).toHaveBeenCalledWith({
      data: {
        name: "Third",
        parentId: "cat-2",
        level: 3,
        isSystem: false,
        sort: 1,
      },
    });
  });

  it("rejects creating children deeper than four levels", async () => {
    prisma.category.findFirst.mockResolvedValue({
      id: "cat-4",
      name: "Fourth",
      level: 4,
      isSystem: false,
      parentId: "cat-3",
    });

    await expect(service.create({ name: "Too deep", parentId: "cat-4", sort: 1 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it("rejects deleting a category that still has children", async () => {
    prisma.category.findFirst.mockResolvedValue({
      id: "cat-1",
      name: "Primary",
      level: 1,
      isSystem: true,
      parentId: null,
    });
    prisma.category.count.mockResolvedValue(1);
    prisma.document.count.mockResolvedValue(0);

    await expect(service.remove("cat-1")).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it("rejects deleting a category that is used by documents", async () => {
    prisma.category.findFirst.mockResolvedValue({
      id: "cat-1",
      name: "Primary",
      level: 1,
      isSystem: true,
      parentId: null,
    });
    prisma.category.count.mockResolvedValue(0);
    prisma.document.count.mockResolvedValue(1);

    await expect(service.remove("cat-1")).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.category.update).not.toHaveBeenCalled();
  });
});
