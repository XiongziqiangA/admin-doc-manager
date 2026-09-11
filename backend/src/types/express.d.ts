import { UserRole, UserStatus } from "@prisma/client";

declare global {
  namespace Express {
    interface User {
      id: string;
      username: string;
      realName: string;
      role: UserRole;
      status: UserStatus;
      organizationId?: string | null;
      departmentId: string | null;
      phone: string | null;
      email: string | null;
      createdAt: Date;
      updatedAt: Date;
    }
  }
}

export {};
