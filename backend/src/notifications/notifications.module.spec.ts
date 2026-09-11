import { MODULE_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";

import { UsersModule } from "../users/users.module";
import { NotificationsModule } from "./notifications.module";

describe("NotificationsModule", () => {
  it("imports UsersModule so JwtAuthGuard can resolve UsersService", () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, NotificationsModule) as unknown[];

    expect(imports).toContain(UsersModule);
  });
});
