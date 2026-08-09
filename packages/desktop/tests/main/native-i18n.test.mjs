import { describe, expect, it } from "vitest";

import {
  nativeLocales,
  nativeMessage,
  normalizeNativeLocale,
} from "../../electron/lib/native-i18n.mjs";

describe("native Electron internationalization", () => {
  it("normalizes macOS locale variants", () => {
    expect(normalizeNativeLocale("zh-Hant-HK")).toBe("zh-TW");
    expect(normalizeNativeLocale("zh-SG")).toBe("zh-CN");
    expect(normalizeNativeLocale("de-AT")).toBe("de");
    expect(normalizeNativeLocale("ar-SA")).toBe("ar");
    expect(normalizeNativeLocale("pt-BR")).toBe("en");
  });

  it("provides every native dialog message in every supported locale", () => {
    const keys = [
      "openProjectTitle",
      "openProjectButton",
      "createProjectTitle",
      "createProjectButton",
      "addFileTitle",
      "addFileButton",
      "assetFilter",
      "unsupportedPreview",
    ];

    nativeLocales.forEach((locale) => {
      keys.forEach((key) => expect(nativeMessage(locale, key), `${locale}:${key}`).not.toBe(key));
    });
  });
});
