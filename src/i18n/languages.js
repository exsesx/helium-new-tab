// Sorted by language code. The settings list sorts by native name.
export const languages = {
  bg: "Български",
  bs: "Bosanski",
  ca: "Català",
  cs: "Čeština",
  da: "Dansk",
  de: "Deutsch",
  el: "Ελληνικά",
  en: "English",
  es: "Español",
  et: "Eesti",
  fi: "Suomi",
  fr: "Français",
  ga: "Gaeilge",
  hr: "Hrvatski",
  hu: "Magyar",
  is: "Íslenska",
  it: "Italiano",
  ja: "日本語",
  ko: "한국어",
  lt: "Lietuvių",
  lv: "Latviešu",
  mk: "Македонски",
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
  tr: "Türkçe",
  uk: "Українська",
  "zh-Hans": "简体中文",
  "zh-Hant": "繁體中文",
};

export function resolveLanguage(choice, preferred = []) {
  if (Object.hasOwn(languages, choice)) {
    return { language: choice, locale: choice };
  }

  for (const tag of preferred) {
    try {
      const locale = new Intl.Locale(tag);
      const base = locale.language;
      let language = base;

      switch (base) {
        case "zh": {
          const script = locale.maximize().script;
          language = script === "Hant" ? "zh-Hant" : "zh-Hans";
          break;
        }

        case "no":
        case "nn":
          language = "nb";
          break;

        case "sr":
          language = "sr-Latn";
          break;
      }

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
