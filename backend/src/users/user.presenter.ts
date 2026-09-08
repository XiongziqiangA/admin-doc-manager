import { User } from "@prisma/client";

export type PublicUser = Omit<User, "passwordHash" | "deletedAt">;

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    username: user.username,
    realName: user.realName,
    role: user.role,
    status: user.status,
    departmentId: user.departmentId,
    phone: user.phone,
    email: user.email,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
