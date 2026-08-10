import { describe, expect, it } from "vitest";

import ar from "../../src/i18n/ar.json";
import de from "../../src/i18n/de.json";
import en from "../../src/i18n/en.json";
import es from "../../src/i18n/es.json";
import fr from "../../src/i18n/fr.json";
import itIT from "../../src/i18n/it.json";
import ja from "../../src/i18n/ja.json";
import ko from "../../src/i18n/ko.json";
import zhCN from "../../src/i18n/zh-CN.json";
import zhTW from "../../src/i18n/zh-TW.json";
import {
  applyDocumentLocale,
  changeAppLocale,
  normalizeLocale,
  supportedLocales,
} from "../../src/i18n/index.js";

const catalogs = { en, "zh-CN": zhCN, "zh-TW": zhTW, es, fr, it: itIT, de, ja, ko, ar };

function flatten(value, prefix = "", output = {}) {
  Object.entries(value).forEach(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object") flatten(child, path, output);
    else output[path] = child;
  });
  return output;
}

function placeholders(value) {
  return [...String(value).matchAll(/\{[^}]+}/g)].map(([match]) => match).sort();
}

describe("desktop internationalization", () => {
  it("ships complete catalogs with matching interpolation variables", () => {
    const english = flatten(en);
    expect(supportedLocales).toEqual(Object.keys(catalogs));

    Object.entries(catalogs).forEach(([locale, catalog]) => {
      const translated = flatten(catalog);
      expect(Object.keys(translated).sort(), locale).toEqual(Object.keys(english).sort());
      Object.entries(english).forEach(([key, value]) => {
        expect(placeholders(translated[key]), `${locale}:${key}`).toEqual(placeholders(value));
      });
    });
  });

  it("normalizes system locales to supported Fylune locales", () => {
    expect(normalizeLocale("zh-Hant-HK")).toBe("zh-TW");
    expect(normalizeLocale("zh-SG")).toBe("zh-CN");
    expect(normalizeLocale("es-MX")).toBe("es");
    expect(normalizeLocale("ar-SA")).toBe("ar");
    expect(normalizeLocale("pt-BR")).toBe("en");
  });

  it("uses workspace terminology throughout every supported locale", () => {
    const workspaceCopy = {
      en: ["Workspace", "Open another workspace"],
      "zh-CN": ["工作空间", "打开另一个工作空间"],
      "zh-TW": ["工作空間", "開啟另一個工作空間"],
      es: ["Espacio de trabajo", "Abrir otro espacio de trabajo"],
      fr: ["Espace de travail", "Ouvrir un autre espace de travail"],
      it: ["Area di lavoro", "Apri un’altra area di lavoro"],
      de: ["Arbeitsbereich", "Anderen Arbeitsbereich öffnen"],
      ja: ["ワークスペース", "別のワークスペースを開く"],
      ko: ["작업 공간", "다른 작업 공간 열기"],
      ar: ["مساحة العمل", "فتح مساحة عمل أخرى"],
    };

    Object.entries(catalogs).forEach(([locale, catalog]) => {
      expect(
        [catalog.sidebar.projectFiles, catalog.sidebar.openAnother],
        locale,
      ).toEqual(workspaceCopy[locale]);
      expect(catalog.files.tree, locale).toBe(workspaceCopy[locale][0]);
    });
  });

  it("keeps the desktop shell LTR while marking Arabic copy as RTL", async () => {
    applyDocumentLocale("ar");
    expect(document.documentElement).toHaveAttribute("lang", "ar");
    expect(document.documentElement).toHaveAttribute("dir", "ltr");
    expect(document.documentElement).toHaveAttribute(
      "data-language-direction",
      "rtl",
    );

    await changeAppLocale("ja");
    expect(document.documentElement).toHaveAttribute("lang", "ja");
    expect(document.documentElement).toHaveAttribute("dir", "ltr");
    expect(document.documentElement).toHaveAttribute(
      "data-language-direction",
      "ltr",
    );

    await changeAppLocale("en");
  });
});
