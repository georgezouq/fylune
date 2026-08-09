import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function inspectMacSignature(executablePath) {
  try {
    const { stderr = "", stdout = "" } = await execFileAsync(
      "/usr/bin/codesign",
      ["-dvvv", executablePath],
      { encoding: "utf8" },
    );
    return `${stdout}\n${stderr}`;
  } catch (error) {
    return `${error?.stdout || ""}\n${error?.stderr || ""}`;
  }
}

export function signatureHasStableTeamIdentity(signatureDetails) {
  const teamIdentifier = signatureDetails.match(/^TeamIdentifier=(.+)$/m)?.[1]?.trim();
  return Boolean(teamIdentifier && teamIdentifier !== "not set");
}

export async function shouldUsePersistentSecureStorage({
  platform = process.platform,
  isPackaged,
  executablePath,
  allowDevelopmentPersistence = false,
  inspectSignature = inspectMacSignature,
}) {
  if (platform !== "darwin") return true;
  if (!executablePath) return false;
  if (!isPackaged) return allowDevelopmentPersistence;
  return signatureHasStableTeamIdentity(await inspectSignature(executablePath));
}
