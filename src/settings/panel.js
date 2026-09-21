import markup from "./panel.html" with { type: "text" };

export function createSettings({ getPreferences, onChange, translator, languages }) {
  const template = document.createElement("template");
  template.innerHTML = markup;
  const dialog = template.content.querySelector("dialog");
  const find = (id) => dialog.querySelector(`#${id}`);
  for (const [code, name] of Object.entries(languages)) {
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
    ...["ui", "mono", "clock", "date", "search"].map((key) => [`${key}-font`, `${key}Font`]),
  ];

  function sync() {
    translator.apply(dialog);
    const preferences = getPreferences();
    for (const [id, key] of fields) {
      const field = find(id);
      field[field.type === "checkbox" ? "checked" : "value"] = preferences[key];
    }
    for (const key of ["ui", "mono", "clock", "date", "search"]) {
      find(`${key}-custom-row`).hidden = preferences[`${key}Font`] !== "custom";
      find(`${key}-custom-font`).value = preferences[`${key}CustomFont`];
    }
  }

  for (const [id, key] of fields) {
    find(id).addEventListener("change", (event) => {
      const field = event.target;
      onChange(key, field.type === "checkbox" ? field.checked : field.value);
      sync();
    });
  }
  for (const key of ["ui", "mono", "clock", "date", "search"]) {
    find(`${key}-custom-font`).addEventListener("input", (event) => {
      onChange(`${key}CustomFont`, event.target.value);
    });
  }
  dialog.querySelector("[data-close]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    const bounds = dialog.getBoundingClientRect();
    if (
      event.target === dialog &&
      (event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom)
    ) {
      dialog.close();
    }
  });
  document.body.append(dialog);
  return {
    open() {
      sync();
      dialog.showModal();
    },
  };
}
