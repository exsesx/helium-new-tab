import markup from "./panel.html" with { type: "text" };
import { fontFamily, fonts } from "../lib/model.js";
import { serviceIconsSupported } from "../lib/service-icons.js";

export function createSettings({ getPreferences, onChange, translator, languages }) {
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
    ["show-service-icons", "showServiceIcons"],
    ...["ui", "mono", "clock", "date", "search"].map((key) => [`${key}-font`, `${key}Font`]),
  ];

  // These settings change nothing while the clock or date is hidden.
  const dependencies = [
    ["time-format", "showClock"],
    ["show-seconds", "showClock"],
    ["clock-font", "showClock"],
    ["clock-custom-font", "showClock"],
    ["date-font", "showDate"],
    ["date-custom-font", "showDate"],
  ];

  // Render each custom name in its own font, so a missing font is visible while typing.
  function previewFont(key) {
    const input = find(`${key}-custom-font`);
    const fallback = key === "mono" ? fonts.mono : fonts.system;

    input.style.fontFamily = fontFamily(input.value, fallback);
  }

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

    for (const [id, key] of dependencies) {
      find(id).disabled = !preferences[key];
    }

    for (const key of ["ui", "mono", "clock", "date", "search"]) {
      find(`${key}-custom-row`).hidden = preferences[`${key}Font`] !== "custom";
      find(`${key}-custom-font`).value = preferences[`${key}CustomFont`];
      previewFont(key);
    }
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
  };
}
