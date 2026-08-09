import path from "node:path";
import { mkdir, readFile, unlink } from "node:fs/promises";
import writeFileAtomic from "write-file-atomic";
import { safeStorage } from "electron";

const SESSION_MARKER = Object.freeze({
  schemaVersion: 1,
  kind: "authenticated-session",
});

function isAuthenticatedSession(value) {
  return (
    new Set(["REGISTERED", "FORMAL"]).has(value?.user?.accountType)
    || Boolean(value?.user?.email)
  );
}

async function removeIfPresent(filePath) {
  try {
    await unlink(filePath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

export class TokenVault {
  constructor(userDataPath, { secureStorage = safeStorage } = {}) {
    this.filePath = path.join(userDataPath, "account.vault");
    this.markerPath = path.join(userDataPath, "account-session.json");
    this.secureStorage = secureStorage;
  }

  async load() {
    try {
      const marker = JSON.parse(await readFile(this.markerPath, "utf8"));
      if (
        marker?.schemaVersion !== SESSION_MARKER.schemaVersion
        || marker?.kind !== SESSION_MARKER.kind
      ) {
        return null;
      }
      const encoded = await readFile(this.filePath, "utf8");
      if (!(await this.secureStorage.isAsyncEncryptionAvailable())) return null;
      const encrypted = Buffer.from(encoded, "base64");
      const decrypted = await this.secureStorage.decryptStringAsync(encrypted);
      const value = JSON.parse(decrypted.result);
      if (!isAuthenticatedSession(value)) return null;
      if (decrypted.shouldReEncrypt) await this.save(value);
      return value;
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      // Stop retrying a denied, locked, or unreadable keychain entry on every
      // launch. The encrypted vault remains untouched, but another read is
      // only attempted after a deliberate authenticated sign-in rewrites the
      // marker.
      await removeIfPresent(this.markerPath).catch(() => {});
      // Never fall back to plaintext token storage when the keychain is locked.
      return null;
    }
  }

  async save(value) {
    if (!isAuthenticatedSession(value)) {
      await this.clear();
      return false;
    }
    if (!(await this.secureStorage.isAsyncEncryptionAvailable())) return false;
    const encrypted = await this.secureStorage.encryptStringAsync(JSON.stringify(value));
    await mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    await writeFileAtomic(this.filePath, encrypted.toString("base64"), {
      encoding: "utf8",
      fsync: true,
      mode: 0o600,
    });
    await writeFileAtomic(this.markerPath, `${JSON.stringify(SESSION_MARKER)}\n`, {
      encoding: "utf8",
      fsync: true,
      mode: 0o600,
    });
    return true;
  }

  async clear() {
    await Promise.all([
      removeIfPresent(this.filePath),
      removeIfPresent(this.markerPath),
    ]);
  }
}
