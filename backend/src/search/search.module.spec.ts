import "reflect-metadata";

import { expect, it } from "vitest";

import { UsersModule } from "../users/users.module";
import { SearchModule } from "./search.module";

it("imports UsersModule so authenticated search guards can resolve UsersService", () => {
  const imports = Reflect.getMetadata("imports", SearchModule) as unknown[];

  expect(imports).toContain(UsersModule);
});
