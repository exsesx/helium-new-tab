import { resolveSearchDestination } from "./search.js";
import { createSearchIcon } from "./search-icon.js";
import { cachedServiceIconUrl, serviceIconsSupported } from "./service-icons.js";

export function createSearchForm({ form, input, icon, service, getPreferences, onError }) {
  const nativeSearch = typeof chrome !== "undefined" && typeof chrome.search?.query === "function";
  const showSearchIcon = createSearchIcon(icon);
  let revision = 0;

  async function updatePreview() {
    const request = ++revision;
    const showServiceIcons = getPreferences().showServiceIcons && serviceIconsSupported();
    let destination;

    if (!showServiceIcons) {
      showSearchIcon();
    }

    try {
      destination = await resolveSearchDestination(input.value);
    } catch {
      // A missing catalog leaves the default search icon visible and no service name.
    }

    if (request !== revision) {
      return;
    }

    const name = destination?.service ?? "";

    // Service names need no permission, so they show whether or not icons are enabled.
    if (service.textContent !== name) {
      service.textContent = name;
      service.title = name;
      service.hidden = !name;
    }

    const origin = showServiceIcons ? destination?.siteOrigin : "";
    const iconUrl = origin ? await cachedServiceIconUrl(origin) : "";

    if (request !== revision) {
      return;
    }

    // Sites without a cached icon keep the search icon instead of the browser's globe.
    showSearchIcon(iconUrl);
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
