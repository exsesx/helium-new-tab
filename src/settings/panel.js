import markup from "./panel.html" with { type: "text" };
import { fontFamily, fonts, PINNED_SITES_LIMIT, siteHost } from "../lib/model.js";
import {
  addPinnedSite,
  movePinnedSite,
  removePinnedSite,
  renamePinnedSite,
} from "../lib/pinned-sites.js";
import { serviceIconsSupported } from "../lib/service-icons.js";
import { showSiteFavicons } from "../lib/site-favicons.js";
import { createSiteIcon } from "../lib/site-tiles.js";

// Messages for the reasons addPinnedSite gives.
const SITE_ERRORS = {
  address: "siteAddressError",
  duplicate: "siteDuplicateError",
  full: "pinnedSitesFull",
};

const SITE_MOVES = { up: -1, down: 1 };

// Where focus goes after a site control changes the list, in order of preference. A move
// button that reaches the end of the list is disabled, so its neighbor takes focus.
const SITE_FOCUS_ORDER = {
  rename: ["rename"],
  up: ["up", "down", "remove"],
  down: ["down", "up", "remove"],
  remove: ["remove"],
};

export function createSettings({
  getPreferences,
  getPinnedSites,
  onChange,
  onPinnedSitesChange,
  translator,
  languages,
}) {
  const template = document.createElement("template");
  template.innerHTML = markup;

  const dialog = template.content.querySelector("dialog");
  const find = (id) => dialog.querySelector(`#${id}`);

  // The preview has no favicon permission, so it cannot show service icons.
  if (!serviceIconsSupported()) {
    find("service-icons-setting").hidden = true;
  }

  const byName = Object.entries(languages).sort(([, a], [, b]) => a.localeCompare(b, "en"));

  for (const [code, name] of byName) {
    find("language").add(new Option(name, code));
  }

  const fields = [
    ["language", "language"],
    ["theme", "theme"],
    ["background", "background"],
    ["show-clock", "showClock"],
    ["time-format", "timeFormat"],
    ["show-seconds", "showSeconds"],
    ["show-date", "showDate"],
    ["type-to-search", "typeToSearch"],
    ["show-pinned-sites", "showPinnedSites"],
    ["show-service-icons", "showServiceIcons"],
    ...["ui", "mono", "clock", "date", "search"].map((key) => [`${key}-font`, `${key}Font`]),
  ];

  // These settings change nothing in a light appearance or while the clock or date is hidden.
  const usesDarkBackground = (preferences) => preferences.theme !== "light";
  const showsClock = (preferences) => preferences.showClock;
  const showsDate = (preferences) => preferences.showDate;
  const showsPinnedSites = (preferences) => preferences.showPinnedSites;

  const dependencies = [
    ["background", usesDarkBackground],
    ["time-format", showsClock],
    ["show-seconds", showsClock],
    ["clock-font", showsClock],
    ["clock-custom-font", showsClock],
    ["date-font", showsDate],
    ["date-custom-font", showsDate],
    ["pinned-site-controls", showsPinnedSites],
  ];

  // Render each custom name in its own font, so a missing font is visible while typing.
  function previewFont(key) {
    const input = find(`${key}-custom-font`);
    const fallback = key === "mono" ? fonts.mono : fonts.system;

    input.style.fontFamily = fontFamily(input.value, fallback);
  }

  const siteList = find("pinned-site-list");
  const siteItem = find("pinned-site-item");
  const siteForm = find("pinned-site-form");
  const siteAddress = find("pinned-site-address");
  const siteName = find("pinned-site-title");
  const siteError = find("pinned-site-error");
  let renderedSites = "";

  const showsSiteFavicons = () => getPreferences().showServiceIcons && serviceIconsSupported();
  const siteIndex = (element) => [...siteList.children].indexOf(element.closest("li"));

  function focusedSiteControl() {
    const active = document.activeElement;

    if (!siteList.contains(active)) {
      return null;
    }

    return { index: siteIndex(active), action: active.dataset.action };
  }

  function focusSiteControl({ index, action }) {
    const item = siteList.children[index];

    if (!item) {
      siteAddress.focus();

      return;
    }

    const controls = SITE_FOCUS_ORDER[action].map((name) =>
      item.querySelector(`[data-action="${name}"]`),
    );

    controls.find((control) => !control.disabled)?.focus();
  }

  function labelSiteItem(item, site) {
    item.querySelector(".site-icon")?.remove();
    item.prepend(createSiteIcon(site));

    for (const button of item.querySelectorAll("button")) {
      button.dataset.site = site.title;
    }

    translator.apply(item);

    if (showsSiteFavicons()) {
      void showSiteFavicons(item);
    }
  }

  function createSiteItem(site, index, sites) {
    const item = siteItem.content.firstElementChild.cloneNode(true);
    const name = item.querySelector('[data-action="rename"]');

    name.value = site.title;
    name.dataset.site = siteHost(site.url);
    item.querySelector('[data-action="up"]').disabled = index === 0;
    item.querySelector('[data-action="down"]').disabled = index === sites.length - 1;
    labelSiteItem(item, site);

    return item;
  }

  function showSiteError(reason) {
    const key = SITE_ERRORS[reason];

    siteError.dataset.i18n = key;
    siteError.textContent = translator.text(key);
    siteAddress.setAttribute("aria-invalid", "true");
  }

  function clearSiteError() {
    delete siteError.dataset.i18n;
    siteError.textContent = "";
    siteAddress.removeAttribute("aria-invalid");
  }

  // At the limit, adding is disabled and a hint says why.
  function updateSiteForm(sites) {
    const full = sites.length >= PINNED_SITES_LIMIT;
    const hadFocus = siteForm.contains(document.activeElement);

    for (const control of siteForm.elements) {
      control.disabled = full;
    }

    find("pinned-sites-full").hidden = !full;

    if (full) {
      clearSiteError();
    }

    if (full && hadFocus) {
      focusSiteControl({ index: sites.length - 1, action: "rename" });
    }
  }

  // Redraws the list when it changed, keeping focus on the same control of the same row.
  function renderSiteList(focus = focusedSiteControl()) {
    const sites = getPinnedSites();
    const state = JSON.stringify([sites, showsSiteFavicons()]);

    if (state === renderedSites) {
      return;
    }

    renderedSites = state;
    siteList.replaceChildren(...sites.map(createSiteItem));
    updateSiteForm(sites);

    if (focus) {
      focusSiteControl({ ...focus, index: Math.min(focus.index, sites.length - 1) });
    }
  }

  // Renaming updates the row in place, so Tab can still move on to the next control.
  function renameSite(input) {
    const index = siteIndex(input);
    const sites = getPinnedSites();
    const next = renamePinnedSite(sites, index, input.value);

    input.value = next[index].title;

    if (next[index].title === sites[index].title) {
      return;
    }

    onPinnedSitesChange(next);
    labelSiteItem(input.closest("li"), next[index]);
    renderedSites = JSON.stringify([next, showsSiteFavicons()]);
  }

  siteList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");

    if (!button) {
      return;
    }

    const { action } = button.dataset;
    const index = siteIndex(button);
    const sites = getPinnedSites();

    switch (action) {
      case "remove":
        onPinnedSitesChange(removePinnedSite(sites, index));
        renderSiteList({ index: Math.min(index, sites.length - 2), action });
        break;

      case "up":
      case "down":
        onPinnedSitesChange(movePinnedSite(sites, index, SITE_MOVES[action]));
        renderSiteList({ index: index + SITE_MOVES[action], action });
        break;
    }
  });

  siteList.addEventListener("change", (event) => {
    if (event.target.dataset.action === "rename") {
      renameSite(event.target);
    }
  });

  // Enter keeps the new name without leaving the field.
  siteList.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing && event.target.dataset.action === "rename") {
      event.preventDefault();
      renameSite(event.target);
    }
  });

  siteForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const result = addPinnedSite(getPinnedSites(), siteAddress.value, siteName.value);

    if (result.error) {
      showSiteError(result.error);
      siteAddress.focus();

      return;
    }

    siteAddress.value = "";
    siteName.value = "";
    clearSiteError();
    onPinnedSitesChange(result.sites);
    renderSiteList();

    if (!siteAddress.disabled) {
      siteAddress.focus();
    }
  });

  siteAddress.addEventListener("input", clearSiteError);

  function sync() {
    translator.apply(dialog);

    const preferences = getPreferences();

    for (const [id, key] of fields) {
      const field = find(id);

      if (field.type === "checkbox") {
        field.checked = preferences[key];
      } else {
        field.value = preferences[key];
      }
    }

    for (const [id, isActive] of dependencies) {
      find(id).disabled = !isActive(preferences);
    }

    for (const key of ["ui", "mono", "clock", "date", "search"]) {
      find(`${key}-custom-row`).hidden = preferences[`${key}Font`] !== "custom";
      find(`${key}-custom-font`).value = preferences[`${key}CustomFont`];
      previewFont(key);
    }

    renderSiteList();
  }

  for (const [id, key] of fields) {
    find(id).addEventListener("change", async (event) => {
      const field = event.target;
      const value = field.type === "checkbox" ? field.checked : field.value;

      // Some changes wait for a permission prompt and may be declined.
      await onChange(key, value);
      sync();
    });
  }

  for (const key of ["ui", "mono", "clock", "date", "search"]) {
    find(`${key}-custom-font`).addEventListener("input", (event) => {
      previewFont(key);
      onChange(`${key}CustomFont`, event.target.value);
    });
  }

  dialog.querySelector("[data-close]").addEventListener("click", () => dialog.close());

  // The backdrop belongs to the dialog, so clicks on it target the dialog itself.
  function onBackdrop(event) {
    const bounds = dialog.getBoundingClientRect();
    const outsidePanel =
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom;

    return event.target === dialog && outsidePanel;
  }

  // Close only when the press also started on the backdrop, so a text selection that is
  // dragged past the panel's edge does not dismiss it.
  let pressedBackdrop = false;

  dialog.addEventListener("pointerdown", (event) => {
    pressedBackdrop = onBackdrop(event);
  });

  dialog.addEventListener("click", (event) => {
    if (pressedBackdrop && onBackdrop(event)) {
      dialog.close();
    }

    pressedBackdrop = false;
  });

  document.body.append(dialog);

  return {
    open() {
      sync();
      dialog.showModal();
    },

    // Show changes that arrive from another tab or device while the panel is open.
    refresh() {
      if (dialog.open) {
        sync();
      }
    },
  };
}
