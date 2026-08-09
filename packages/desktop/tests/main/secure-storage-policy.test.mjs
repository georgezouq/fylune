import { describe, expect, it } from "vitest";

import {
  shouldUsePersistentSecureStorage,
  signatureHasStableTeamIdentity,
} from "../../electron/lib/secure-storage-policy.mjs";

describe("secure storage policy", () => {
  it("recognizes stable team-signed macOS applications", () => {
    expect(signatureHasStableTeamIdentity("Signature=adhoc\nTeamIdentifier=not set\n")).toBe(false);
    expect(signatureHasStableTeamIdentity("Authority=Developer ID Application\nTeamIdentifier=ABCDE12345\n")).toBe(true);
  });

  it("enables Keychain persistence only for the explicit development test environment", async () => {
    let inspections = 0;
    const defaultDevelopment = await shouldUsePersistentSecureStorage({
      platform: "darwin",
      isPackaged: false,
      executablePath: "/tmp/Fylune",
      inspectSignature: async () => { inspections += 1; return ""; },
    });
    const connectedTestEnvironment = await shouldUsePersistentSecureStorage({
      platform: "darwin",
      isPackaged: false,
      executablePath: "/tmp/Fylune",
      allowDevelopmentPersistence: true,
      inspectSignature: async () => { inspections += 1; return ""; },
    });
    const adHoc = await shouldUsePersistentSecureStorage({
      platform: "darwin",
      isPackaged: true,
      executablePath: "/tmp/Fylune",
      allowDevelopmentPersistence: true,
      inspectSignature: async () => { inspections += 1; return "Signature=adhoc\nTeamIdentifier=not set\n"; },
    });

    expect(defaultDevelopment).toBe(false);
    expect(connectedTestEnvironment).toBe(true);
    expect(adHoc).toBe(false);
    expect(inspections).toBe(1);
  });

  it("enables secure persistence for signed macOS releases and non-macOS builds", async () => {
    const signed = await shouldUsePersistentSecureStorage({
      platform: "darwin",
      isPackaged: true,
      executablePath: "/Applications/Fylune.app/Contents/MacOS/Fylune",
      inspectSignature: async () => "Authority=Developer ID Application\nTeamIdentifier=ABCDE12345\n",
    });
    const windows = await shouldUsePersistentSecureStorage({
      platform: "win32",
      isPackaged: true,
      executablePath: "C:\\Program Files\\Fylune\\Fylune.exe",
    });

    expect(signed).toBe(true);
    expect(windows).toBe(true);
  });
});
