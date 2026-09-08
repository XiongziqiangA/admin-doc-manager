import { describe, expect, it } from "vitest";

import { PasswordService } from "./password.service";

describe("PasswordService", () => {
  const service = new PasswordService();

  it("hashes passwords without storing plaintext", async () => {
    const hash = await service.hashPassword("ChangeMe123!");

    expect(hash).not.toBe("ChangeMe123!");
    expect(hash).toMatch(/^scrypt:/);
  });

  it("verifies the original password", async () => {
    const hash = await service.hashPassword("ChangeMe123!");

    await expect(service.verifyPassword("ChangeMe123!", hash)).resolves.toBe(true);
  });

  it("rejects the wrong password", async () => {
    const hash = await service.hashPassword("ChangeMe123!");

    await expect(service.verifyPassword("WrongPassword", hash)).resolves.toBe(false);
  });
});
