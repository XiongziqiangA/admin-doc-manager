import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const systemCategories = [
  { name: "\u884c\u653f\u5236\u5ea6", code: "XZ", sort: 10 },
  { name: "\u5408\u540c\u6587\u4ef6", code: "HT", sort: 20 },
  { name: "\u8d44\u8d28\u8bc1\u7167", code: "ZZ", sort: 30 },
  { name: "\u4eba\u4e8b\u8d44\u6599", code: "RS", sort: 40 },
  { name: "\u8d22\u52a1\u7968\u636e", code: "CW", sort: 50 },
  { name: "\u5ba2\u6237\u8d44\u6599", code: "KH", sort: 60 },
  { name: "\u4f9b\u5e94\u5546\u8d44\u6599", code: "GYS", sort: 70 },
  { name: "\u8d44\u4ea7\u8bbe\u5907", code: "ZC", sort: 80 },
  { name: "\u529e\u516c\u573a\u5730", code: "BG", sort: 90 },
  { name: "\u5176\u4ed6\u8d44\u6599", code: "QT", sort: 100 },
];

const otherSubcategories = [
  { name: "\u4f1a\u8bae\u901a\u77e5", sort: 10 },
  { name: "\u7528\u5370\u8bc1\u660e", sort: 20 },
  { name: "\u8868\u5355\u6a21\u677f", sort: 30 },
  { name: "\u4e34\u65f6\u5f52\u6863", sort: 40 },
];

async function upsertSubcategory(parentId, subcategory) {
  const existing = await prisma.category.findFirst({
    where: {
      parentId,
      level: 2,
      name: subcategory.name,
    },
  });

  if (existing) {
    return prisma.category.update({
      where: { id: existing.id },
      data: {
        sort: subcategory.sort,
        deletedAt: null,
        isSystem: false,
      },
    });
  }

  return prisma.category.create({
    data: {
      name: subcategory.name,
      parentId,
      level: 2,
      isSystem: false,
      sort: subcategory.sort,
    },
  });
}

async function main() {
  let otherCategory;

  for (const category of systemCategories) {
    const savedCategory = await prisma.category.upsert({
      where: { code: category.code },
      update: {
        name: category.name,
        level: 1,
        isSystem: true,
        parentId: null,
        sort: category.sort,
        deletedAt: null,
      },
      create: {
        ...category,
        level: 1,
        isSystem: true,
      },
    });

    if (category.code === "QT") {
      otherCategory = savedCategory;
    }
  }

  if (!otherCategory) {
    throw new Error("Other category was not seeded.");
  }

  for (const subcategory of otherSubcategories) {
    await upsertSubcategory(otherCategory.id, subcategory);
  }

  console.log("Base system categories and other subcategories seeded.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
