export const DIRECT_UPDATE_ARCHITECTURES = Object.freeze(["arm64", "x64"]);
export const DIRECT_UPDATE_PLATFORMS = Object.freeze(["darwin", "win32"]);

export function directUpdateFeed(architecture, platform = "darwin") {
  if (!DIRECT_UPDATE_ARCHITECTURES.includes(architecture)) {
    throw new Error(`Unsupported direct-update architecture: ${architecture}`);
  }
  if (!DIRECT_UPDATE_PLATFORMS.includes(platform)) {
    throw new Error(`Unsupported direct-update platform: ${platform}`);
  }
  return {
    provider: "github",
    owner: "georgezouq",
    repo: "fylune",
    releaseType: "release",
  };
}
