import "reflect-metadata";

import { describe, expect, it } from "vitest";

import { AuthModule } from "../auth/auth.module";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { UsersModule } from "../users/users.module";
import { AssetsModule } from "./assets.module";

describe("AssetsModule", () => {
  it("imports authentication dependencies needed by JwtAuthGuard at runtime", () => {
    const imports = Reflect.getMetadata("imports", AssetsModule) as unknown[];
    const providers = Reflect.getMetadata("providers", AssetsModule) as unknown[];

    expect(imports).toContain(AuthModule);
    expect(imports).toContain(UsersModule);
    expect(providers).toContain(JwtAuthGuard);
  });
});
