import type { I18nDictionary, I18nKey, Locale } from "./types";

export type { I18nDictionary, I18nKey, Locale } from "./types";

const localeLoaders: Record<Locale, () => Promise<{ default: I18nDictionary }>> = {
  en: () => import("./locales/en"),
  "zh-CN": () => import("./locales/zh-CN"),
};

const cache = new Map<Locale, I18nDictionary>();

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const val = params[key];
    return val !== undefined ? String(val) : `{${key}}`;
  });
}

export function createI18n(locale: Locale = "en") {
  function loadSync(loc: Locale): I18nDictionary {
    const cached = cache.get(loc);
    if (cached) return cached;
    // Fallback to en for unloaded locales
    if (loc === "en") {
      const mod = require("./locales/en");
      const dict = mod.default || mod;
      cache.set("en", dict);
      return dict;
    }
    return loadSync("en");
  }

  async function load(): Promise<void> {
    const loader = localeLoaders[locale] ?? localeLoaders.en;
    const mod = await loader();
    cache.set(locale, mod.default);
  }

  function t(key: I18nKey, params?: Record<string, string | number>): string {
    const dict = loadSync(locale);
    const template = dict[key];
    if (template === undefined) {
      const enDict = loadSync("en");
      const enTemplate = enDict[key];
      if (enTemplate === undefined) return key;
      if (Array.isArray(enTemplate)) return enTemplate[0];
      return interpolate(enTemplate, params);
    }
    if (Array.isArray(template)) return template[0];
    return interpolate(template, params);
  }

  function tArray(key: I18nKey): string[] {
    const dict = loadSync(locale);
    const template = dict[key];
    if (Array.isArray(template)) return template;
    const enDict = loadSync("en");
    const enTemplate = enDict[key];
    if (Array.isArray(enTemplate)) return enTemplate;
    return [template ?? key];
  }

  function getLocale(): Locale {
    return locale;
  }

  return { t, tArray, load, getLocale };
}

let defaultLocale: Locale = "en";
let instance = createI18n(defaultLocale);

export function setDefaultLocale(locale: Locale): void {
  defaultLocale = locale;
  instance = createI18n(locale);
}

export function i18n() {
  return instance;
}

// Preload the default locale
instance.load();
