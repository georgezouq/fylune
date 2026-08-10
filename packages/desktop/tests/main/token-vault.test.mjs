import path from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  safeStorage: {},
}));

import { TokenVault } from "../../electron/lib/token-vault.mjs";

describe("account token vault", () => {
  let dataDirectory;
  let secureStorage;

  beforeEach(async () => {
    dataDirectory = await mkdtemp(path.join(tmpdir(), "fylune-token-vault-"));
    secureStorage = {
      isAsyncEncryptionAvailable: vi.fn(async () => true),
      encryptStringAsync: vi.fn(async (value) => Buffer.from(`encrypted:${value}`, "utf8")),
      decryptStringAsync: vi.fn(async (value) => ({
        result: value.toString("utf8").replace(/^encrypted:/, ""),
        shouldReEncrypt: false,
      })),
    };
  });

  afterEach(async () => {
    await rm(dataDirectory, { recursive: true, force: true });
  });

  it("ignores a legacy vault without prompting the keychain", async () => {
    await writeFile(path.join(dataDirectory, "account.vault"), "legacy-encrypted-value");
    const vault = new TokenVault(dataDirectory, { secureStorage });

    await expect(vault.load()).resolves.toBeNull();
    expect(secureStorage.isAsyncEncryptionAvailable).not.toHaveBeenCalled();
    expect(secureStorage.decryptStringAsync).not.toHaveBeenCalled();
  });

  it("does not persist a guest session", async () => {
    const vault = new TokenVault(dataDirectory, { secureStorage });

    await expect(vault.save({
      accessToken: "guest-access",
      refreshToken: "guest-refresh",
      user: {
        id: "guest-1",
        email: null,
        accountType: "GUEST",
      },
    })).resolves.toBe(false);

    expect(secureStorage.encryptStringAsync).not.toHaveBeenCalled();
    await expect(readFile(vault.filePath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(vault.markerPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("persists and restores an explicitly authenticated session", async () => {
    const vault = new TokenVault(dataDirectory, { secureStorage });
    const session = {
      accessToken: "registered-access",
      refreshToken: "registered-refresh",
      user: {
        id: "user-1",
        email: "user@example.com",
        accountType: "REGISTERED",
      },
    };

    await expect(vault.save(session)).resolves.toBe(true);
    await expect(vault.load()).resolves.toEqual(session);
    expect(JSON.parse(await readFile(vault.markerPath, "utf8"))).toEqual({
      schemaVersion: 1,
      kind: "authenticated-session",
    });
    expect(secureStorage.encryptStringAsync).toHaveBeenCalledOnce();
    expect(secureStorage.decryptStringAsync).toHaveBeenCalledOnce();
  });

  it("does not repeat a denied keychain request on every launch", async () => {
    const vault = new TokenVault(dataDirectory, { secureStorage });
    await vault.save({
      accessToken: "registered-access",
      user: {
        id: "user-1",
        email: "user@example.com",
        accountType: "REGISTERED",
      },
    });
    secureStorage.decryptStringAsync.mockRejectedValueOnce(new Error("The keychain request was denied"));

    await expect(vault.load()).resolves.toBeNull();
    await expect(readFile(vault.markerPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(secureStorage.decryptStringAsync).toHaveBeenCalledOnce();

    await expect(vault.load()).resolves.toBeNull();
    expect(secureStorage.decryptStringAsync).toHaveBeenCalledOnce();
  });

  it("removes both encrypted credentials and their opt-in marker", async () => {
    const vault = new TokenVault(dataDirectory, { secureStorage });
    await vault.save({
      accessToken: "registered-access",
      user: {
        id: "user-1",
        email: "user@example.com",
        accountType: "REGISTERED",
      },
    });

    await vault.clear();

    await expect(readFile(vault.filePath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(vault.markerPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
