import { PrismaClient, UserRole, UserStatus } from "@prisma/client";
import { randomBytes, scrypt } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const prisma = new PrismaClient();
const scryptAsync = promisify(scrypt);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(scriptDir, "../../.env");

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(envPath);

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = await scryptAsync(password, salt, 64);
  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
}

export async function retireLegacyDefaultAdmin({ prisma: client, username, now = new Date() }) {
  if (username === "admin") {
    return 0;
  }

  const result = await client.user.updateMany({
    where: {
      username: "admin",
      status: UserStatus.ACTIVE,
      deletedAt: null,
    },
    data: {
      status: UserStatus.DISABLED,
      deletedAt: now,
    },
  });
  return result.count;
}

async function main() {
  const username = process.env.ADMIN_USERNAME ?? "admin";
  const password = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";
  const realName = process.env.ADMIN_REAL_NAME ?? "\u7cfb\u7edf\u7ba1\u7406\u5458";
  const overwriteExisting = process.env.SEED_ADMIN_OVERWRITE === "true";

  await retireLegacyDefaultAdmin({ prisma, username });

  const existing = await prisma.user.findUnique({ where: { username } });

  if (existing && !overwriteExisting) {
    console.log(`Admin user "${username}" already exists; seed skipped.`);
    return;
  }

  const data = {
    passwordHash: await hashPassword(password),
    realName,
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
  };

  if (existing) {
    await prisma.user.update({
      where: { username },
      data,
    });
    console.log(`Admin user "${username}" updated.`);
    return;
  }

  await prisma.user.create({
    data: {
      username,
      ...data,
    },
  });
  console.log(`Admin user "${username}" created.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
