import { resolveSearchDestination } from "./search.js";
import { createSearchIcon } from "./search-icon.js";

export function createSearchForm({ form, input, icon, getPreferences, onError }) {
  const nativeSearch = typeof chrome !== "undefined" && typeof chrome.search?.query === "function";
  const showSearchIcon = createSearchIcon(icon);
  let revision = 0;

  async function updatePreview() {
    const request = ++revision;
    const { showServiceIcons } = getPreferences();
    let destination;

    if (!showServiceIcons) {
      showSearchIcon();
    }

    try {
      destination = await resolveSearchDestination(input.value);
    } catch {
      // A missing catalog leaves the default search icon visible.
    }

    if (request !== revision) {
      return;
    }

    showSearchIcon(showServiceIcons ? destination?.favicon : "");
  }

  input.addEventListener("input", updatePreview);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const destination = await resolveSearchDestination(input.value);

      if (destination.url) {
        location.assign(destination.url);

        return;
      }

      if (!destination.query) {
        input.focus();

        return;
      }

      if (nativeSearch) {
        await chrome.search.query({ text: destination.query, disposition: "CURRENT_TAB" });
      } else {
        location.assign(`https://duckduckgo.com/?q=${encodeURIComponent(destination.query)}`);
      }
    } catch {
      onError();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && event.target === input && !event.isComposing) {
      event.preventDefault();
      input.blur();

      return;
    }

    if (
      event.key === "/" &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !document.querySelector("dialog[open]") &&
      !event.target.matches("input, textarea, select, [contenteditable]")
    ) {
      event.preventDefault();
      input.focus();
    }
  });

  return { updatePreview };
}
