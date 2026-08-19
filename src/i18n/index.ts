import { useState, useEffect } from "react";
import type { I18nStrings } from "./types";

export type { I18nStrings };
export type Locale = "en" | "nl" | "de" | "fr" | "es" | "ja";

export const SUPPORTED_LOCALES: { code: Locale; label: string; flag: string }[] = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "nl", label: "Nederlands", flag: "🇳🇱" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "ja", label: "日本語", flag: "🇯🇵" },
];

const cache: Partial<Record<Locale, I18nStrings>> = {};

async function loadLocale(locale: Locale): Promise<I18nStrings> {
  if (cache[locale]) return cache[locale]!;
  const mod = await import(`./locales/${locale}.json`);
  cache[locale] = mod.default as I18nStrings;
  return cache[locale]!;
}

function detectLocale(): Locale {
  const lang = navigator.language.slice(0, 2).toLowerCase();
  const supported = SUPPORTED_LOCALES.map((l) => l.code);
  return supported.includes(lang as Locale) ? (lang as Locale) : "en";
}

let globalLocale: Locale = detectLocale();
const listeners = new Set<() => void>();

export function setLocale(locale: Locale) {
  globalLocale = locale;
  listeners.forEach((fn) => fn());
}

export function getLocale(): Locale {
  return globalLocale;
}

export function useI18n(): { t: I18nStrings; locale: Locale; setLocale: typeof setLocale } {
  const [locale, setLocaleState] = useState<Locale>(globalLocale);
  const [strings, setStrings] = useState<I18nStrings | null>(null);

  useEffect(() => {
    const rerender = () => setLocaleState(globalLocale);
    listeners.add(rerender);
    return () => { listeners.delete(rerender); };
  }, []);

  useEffect(() => {
    loadLocale(locale).then(setStrings);
  }, [locale]);

  const fallback = strings ?? ({} as I18nStrings);

  return { t: fallback, locale, setLocale };
}

/** Plain interpolation helper: t("formats.count", { n: 5 }) → "5 formats" */
export function ti(template: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replace(`{${k}}`, String(v)),
    template,
  );
}
