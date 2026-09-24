import { resolveSearchDestination } from "./search.js";
import { createSearchIcon } from "./search-icon.js";
import { cachedServiceIconUrl, markIconTone, serviceIconsSupported } from "./service-icons.js";

// Where results open. The first three are chrome.search.query dispositions; it has none for
// background tabs, so those search in a tab opened with chrome.tabs.create instead.
const DISPOSITIONS = {
  currentTab: "CURRENT_TAB",
  newTab: "NEW_TAB",
  newWindow: "NEW_WINDOW",
  backgroundTab: "BACKGROUND_TAB",
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

  // Follows link-click conventions: Ctrl, Cmd, or Alt opens a background tab and adding Shift
  // switches to it, while Shift alone opens a window.
  function dispositionFor(event) {
    const opensTab = event.ctrlKey || event.metaKey || event.altKey;

    if (opensTab) {
      return event.shiftKey ? DISPOSITIONS.newTab : DISPOSITIONS.backgroundTab;
    }

    if (event.shiftKey) {
      return DISPOSITIONS.newWindow;
    }

    return DISPOSITIONS.currentTab;
  }

  // Extension pages may create tabs and windows without the tabs permission.
  async function open(url, disposition) {
    const extension = typeof chrome !== "undefined";

    switch (disposition) {
      case DISPOSITIONS.newTab:
      case DISPOSITIONS.backgroundTab:
        if (extension && chrome.tabs?.create) {
          await chrome.tabs.create({ url, active: disposition === DISPOSITIONS.newTab });
        } else {
          // The preview cannot open tabs behind itself.
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

  async function search(text, disposition) {
    if (disposition !== DISPOSITIONS.backgroundTab) {
      await chrome.search.query({ text, disposition });

      return;
    }

    const tab = await chrome.tabs.create({ url: "about:blank", active: false });
    await chrome.search.query({ text, tabId: tab.id });
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
        await search(destination.query, disposition);
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

  // A middle click opens a background tab, as it does on links; Shift switches to it.
  submitButton.addEventListener("auxclick", (event) => {
    if (event.button !== 1) {
      return;
    }

    event.preventDefault();
    void submit(event.shiftKey ? DISPOSITIONS.newTab : DISPOSITIONS.backgroundTab);
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
