export const languages = {
  en: "English",
  bg: "Български",
  ca: "Català",
  cs: "Čeština",
  da: "Dansk",
  de: "Deutsch",
  el: "Ελληνικά",
  es: "Español",
  et: "Eesti",
  fi: "Suomi",
  fr: "Français",
  ga: "Gaeilge",
  hr: "Hrvatski",
  hu: "Magyar",
  is: "Íslenska",
  it: "Italiano",
  lt: "Lietuvių",
  lv: "Latviešu",
  mt: "Malti",
  nb: "Norsk bokmål",
  nl: "Nederlands",
  pl: "Polski",
  pt: "Português",
  ro: "Română",
  sk: "Slovenčina",
  sl: "Slovenščina",
  sq: "Shqip",
  "sr-Latn": "Srpski",
  sv: "Svenska",
  bs: "Bosanski",
  mk: "Македонски",
  tr: "Türkçe",
  uk: "Українська",
  "zh-Hans": "简体中文",
  "zh-Hant": "繁體中文",
  ja: "日本語",
  ko: "한국어",
};

export function resolveLanguage(choice, preferred = []) {
  if (Object.hasOwn(languages, choice)) {
    return { language: choice, locale: choice };
  }
  for (const tag of preferred) {
    try {
      const locale = new Intl.Locale(tag);
      const base = locale.language;
      const language =
        base === "zh"
          ? `zh-${locale.maximize().script === "Hant" ? "Hant" : "Hans"}`
          : base === "no" || base === "nn"
            ? "nb"
            : base === "sr"
              ? "sr-Latn"
              : base;
      if (Object.hasOwn(languages, language)) {
        return {
          language,
          locale:
            base === "sr" ? new Intl.Locale(tag, { script: "Latn" }).toString() : locale.toString(),
        };
      }
    } catch {
      // Ignore malformed browser language tags.
    }
  }
  return { language: "en", locale: "en" };
}
