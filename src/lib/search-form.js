import { resolveSearchDestination } from "./search.js";
import { createSearchIcon } from "./search-icon.js";
import { cachedServiceIconUrl, markIconTone, serviceIconsSupported } from "./service-icons.js";

// The values chrome.search.query accepts for where results open.
const DISPOSITIONS = {
  currentTab: "CURRENT_TAB",
  newTab: "NEW_TAB",
  newWindow: "NEW_WINDOW",
};

export function createSearchForm({ form, input, icon, service, getPreferences, onError }) {
  const submitButton = form.querySelector('[type="submit"]');
  const nativeSearch = typeof chrome !== "undefined" && typeof chrome.search?.query === "function";
  const showSearchIcon = createSearchIcon(icon, markIconTone);
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

  // Follows link-click conventions: Shift opens a window, Ctrl, Cmd, or Alt opens a tab.
  function dispositionFor(event) {
    if (event.shiftKey) {
      return DISPOSITIONS.newWindow;
    }

    if (event.ctrlKey || event.metaKey || event.altKey) {
      return DISPOSITIONS.newTab;
    }

    return DISPOSITIONS.currentTab;
  }

  // Extension pages may create tabs and windows without the tabs permission.
  async function open(url, disposition) {
    const extension = typeof chrome !== "undefined";

    switch (disposition) {
      case DISPOSITIONS.newTab:
        if (extension && chrome.tabs?.create) {
          await chrome.tabs.create({ url });
        } else {
          window.open(url, "_blank", "noopener");
        }

        break;

      case DISPOSITIONS.newWindow:
        if (extension && chrome.windows?.create) {
          await chrome.windows.create({ url });
        } else {
          window.open(url, "_blank", "noopener,popup");
        }

        break;

      default:
        location.assign(url);
    }
  }

  async function submit(disposition) {
    try {
      const destination = await resolveSearchDestination(input.value);

      if (destination.url) {
        await open(destination.url, disposition);

        return;
      }

      if (!destination.query) {
        input.focus();

        return;
      }

      if (nativeSearch) {
        await chrome.search.query({ text: destination.query, disposition });
      } else {
        await open(
          `https://duckduckgo.com/?q=${encodeURIComponent(destination.query)}`,
          disposition,
        );
      }
    } catch {
      onError();
    }
  }

  input.addEventListener("input", updatePreview);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submit(DISPOSITIONS.currentTab);
  });

  // Plain Enter and clicks submit the form; modified ones open elsewhere instead.
  input.addEventListener("keydown", (event) => {
    const disposition = dispositionFor(event);

    if (event.key !== "Enter" || event.isComposing || disposition === DISPOSITIONS.currentTab) {
      return;
    }

    event.preventDefault();
    void submit(disposition);
  });

  submitButton.addEventListener("click", (event) => {
    const disposition = dispositionFor(event);

    if (disposition === DISPOSITIONS.currentTab) {
      return;
    }

    event.preventDefault();
    void submit(disposition);
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
