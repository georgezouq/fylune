import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import zhCN from "./zh-CN.json";
import zhTW from "./zh-TW.json";
import es from "./es.json";
import fr from "./fr.json";
import it from "./it.json";
import de from "./de.json";
import ja from "./ja.json";
import ko from "./ko.json";
import ar from "./ar.json";

export const supportedLocales = [
  "en",
  "zh-CN",
  "zh-TW",
  "es",
  "fr",
  "it",
  "de",
  "ja",
  "ko",
  "ar",
];

export const languagePreferenceKey = "fylune-language";

const resources = {
  en: { translation: en },
  "zh-CN": { translation: zhCN },
  "zh-TW": { translation: zhTW },
  es: { translation: es },
  fr: { translation: fr },
  it: { translation: it },
  de: { translation: de },
  ja: { translation: ja },
  ko: { translation: ko },
  ar: { translation: ar },
};

export function normalizeLocale(value) {
  const locale = String(value || "").replace("_", "-");
  if (/^zh-(TW|HK|MO|Hant)/i.test(locale)) return "zh-TW";
  if (/^zh/i.test(locale)) return "zh-CN";
  const exact = supportedLocales.find((item) => item.toLowerCase() === locale.toLowerCase());
  if (exact) return exact;
  return supportedLocales.find((item) => locale.toLowerCase().startsWith(`${item.toLowerCase()}-`)) || "en";
}

export function systemLocale() {
  const candidates = globalThis.navigator?.languages?.length
    ? globalThis.navigator.languages
    : [globalThis.navigator?.language];
  return normalizeLocale(candidates.find(Boolean));
}

export function resolveLocalePreference(preference = "system") {
  return preference === "system" ? systemLocale() : normalizeLocale(preference);
}

export function applyDocumentLocale(locale) {
  if (!globalThis.document) return;
  document.documentElement.lang = locale;
  // Keep the desktop window chrome and workspace geometry stable. Arabic changes
  // the reading direction of localized copy, not the location of navigation,
  // tabs, window controls, panels, or actions.
  document.documentElement.dir = "ltr";
  document.documentElement.dataset.languageDirection =
    locale === "ar" ? "rtl" : "ltr";
}

export async function changeAppLocale(preference = "system") {
  const locale = resolveLocalePreference(preference);
  await i18n.changeLanguage(locale);
  applyDocumentLocale(locale);
  globalThis.localStorage?.setItem(languagePreferenceKey, preference);
  return locale;
}

const storedPreference = globalThis.localStorage?.getItem(languagePreferenceKey) || "system";
const initialLocale = resolveLocalePreference(storedPreference);

void i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: initialLocale,
    fallbackLng: "en",
    supportedLngs: supportedLocales,
    interpolation: {
      escapeValue: false,
      prefix: "{",
      suffix: "}",
    },
    returnEmptyString: false,
  })
  .then(() => applyDocumentLocale(initialLocale));

export default i18n;
