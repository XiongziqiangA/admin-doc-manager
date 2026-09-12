import { expect, test, vi } from "vitest";

import { retireLegacyDefaultAdmin } from "./seed-admin.mjs";

test("retireLegacyDefaultAdmin soft-disables the default account instead of deleting it", async () => {
  const now = new Date("2026-09-12T00:00:00.000Z");
  const updateMany = vi.fn(async (args) => {
    expect(args).toEqual({
      where: {
        username: "admin",
        status: "ACTIVE",
        deletedAt: null,
      },
      data: {
        status: "DISABLED",
        deletedAt: now,
      },
    });
    return { count: 1 };
  });
  const client = { user: { updateMany } };

  expect(await retireLegacyDefaultAdmin({ prisma: client, username: "acceptance-admin", now })).toBe(1);
});

test("retireLegacyDefaultAdmin leaves the configured admin username untouched", async () => {
  const updateMany = vi.fn(async () => ({ count: 1 }));
  const client = { user: { updateMany } };

  expect(await retireLegacyDefaultAdmin({ prisma: client, username: "admin" })).toBe(0);
  expect(updateMany).not.toHaveBeenCalled();
});
