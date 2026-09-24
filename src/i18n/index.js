import english from "./locales/en.json";
import { loadCatalog } from "./languages.js";

export { languages, loadCatalog, resolveLanguage } from "./languages.js";

// Cache only requested translations. Failed requests can be retried next time.
export function createTranslator(fetchCatalog = loadCatalog) {
  const cache = new Map([["en", english]]);
  let revision = 0;
  let messages = english;

  return {
    text(key) {
      return messages[key] ?? english[key];
    },

    async select(language) {
      const request = ++revision;
      let next;
      let failed = false;

      try {
        next = cache.get(language) ?? (await fetchCatalog(language));
        cache.set(language, next);
      } catch {
        next = english;
        failed = true;
      }

      if (request !== revision) {
        return { stale: true };
      }

      messages = next;

      return { language: failed ? "en" : language, failed };
    },

    apply(root) {
      for (const [attribute, target] of [
        ["data-i18n", null],
        ["data-i18n-label", "aria-label"],
        ["data-i18n-placeholder", "placeholder"],
      ]) {
        for (const element of root.querySelectorAll(`[${attribute}]`)) {
          const key = element.getAttribute(attribute);
          const message = messages[key] ?? english[key];
          const text = message?.replace("{font}", element.dataset.fontExample ?? "Inter");

          if (text === undefined) {
            continue;
          }

          if (target) {
            element.setAttribute(target, text);
          } else {
            element.textContent = text;
          }
        }
      }
    },
  };
}
