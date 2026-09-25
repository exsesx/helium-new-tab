import english from "./locales/en.json";
import { translate } from "./languages.js";

export { languages, resolveLanguage } from "./languages.js";

// Cache only requested translations. Failed requests can be retried next time.
export function createTranslator(
  fetchCatalog = async (language) => {
    const response = await fetch(new URL(`../locales/${language}.json`, import.meta.url));

    if (!response.ok) {
      throw new Error("Translation unavailable");
    }

    return response.json();
  },
) {
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
      translate(root, (key) => messages[key] ?? english[key]);
    },
  };
}
