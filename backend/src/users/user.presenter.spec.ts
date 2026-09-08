import { describe, expect, it } from "vitest";
import { UserRole, UserStatus } from "@prisma/client";

import { toPublicUser } from "./user.presenter";

describe("toPublicUser", () => {
  it("removes password hashes from API output", () => {
    const user = {
      id: "user_1",
      username: "admin",
      passwordHash: "secret-hash",
      realName: "管理员",
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      departmentId: null,
      phone: null,
      email: null,
      createdAt: new Date("2026-07-27T00:00:00.000Z"),
      updatedAt: new Date("2026-07-27T00:00:00.000Z"),
      deletedAt: null,
    };

    expect(toPublicUser(user)).toEqual({
      id: "user_1",
      username: "admin",
      realName: "管理员",
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      departmentId: null,
      phone: null,
      email: null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  });
});
