import { User, UserRole, UserStatus } from "@prisma/client";

export interface PublicUser {
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

type PresentableUser = Omit<User, "organizationId"> & {
  organizationId?: string | null;
};

export function toPublicUser(user: PresentableUser): PublicUser {
  const publicUser: PublicUser = {
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

  if ("organizationId" in user) {
    publicUser.organizationId = user.organizationId;
  }

  return publicUser;
}
