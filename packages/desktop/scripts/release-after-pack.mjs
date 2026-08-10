/* global console */
import path from "node:path";
import { spawnSync } from "node:child_process";

export const UNUSED_PERMISSION_DESCRIPTIONS = Object.freeze([
  "NSAudioCaptureUsageDescription",
  "NSBluetoothAlwaysUsageDescription",
  "NSBluetoothPeripheralUsageDescription",
  "NSCameraUsageDescription",
  "NSMicrophoneUsageDescription",
]);

function runPlutil(args, { allowMissing = false } = {}) {
  const result = spawnSync("plutil", args, { encoding: "utf8" });
  if (result.status !== 0 && !allowMissing) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`plutil ${args.join(" ")} failed${detail ? `:\n${detail}` : ""}`);
  }
  return result.status === 0;
}

export default async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const productFilename = context.packager.appInfo.productFilename;
  const infoPlist = path.join(
    context.appOutDir,
    `${productFilename}.app`,
    "Contents",
    "Info.plist",
  );

  runPlutil([
    "-replace",
    "NSAppTransportSecurity.NSAllowsArbitraryLoads",
    "-bool",
    "NO",
    infoPlist,
  ]);
  runPlutil([
    "-replace",
    "NSAppTransportSecurity.NSAllowsLocalNetworking",
    "-bool",
    "YES",
    infoPlist,
  ]);

  for (const key of UNUSED_PERMISSION_DESCRIPTIONS) {
    runPlutil(["-remove", key, infoPlist], { allowMissing: true });
  }

  runPlutil(["-lint", infoPlist]);
  console.log(`Hardened macOS Info.plist: ${infoPlist}`);
}
