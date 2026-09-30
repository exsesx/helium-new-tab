import { importBackgroundImage } from "../lib/background-image.js";
import {
  readStoredImage,
  removeBackgroundImage,
  saveBackgroundImage,
} from "../lib/background-photo.js";
import { BACKGROUND_COLORS, loadBackgroundImage } from "../lib/background.js";

const DARK_BACKGROUNDS = ["blend", "helium"];

const IMAGE_ERRORS = {
  type: "imageTypeError",
  size: "imageSizeError",
  storage: "imageStorageError",
};

// The Background group in Customize: a default, color, or image mode with a panel for each.
// onUpdate shows the result of a choice; it syncs and translates the whole panel.
export function createBackgroundSettings({ dialog, getPreferences, onChange, onUpdate }) {
  const find = (id) => dialog.querySelector(`#${id}`);
  const modes = [...dialog.querySelectorAll('[name="background-mode"]')];
  const panels = [...dialog.querySelectorAll("[data-background-panel]")];
  const colorInput = find("custom-color");
  const customSwatch = colorInput.closest(".custom-swatch");
  const fileInput = find("background-file");
  const preview = find("background-preview");
  const removeButton = find("remove-background-image");
  const message = find("background-image-message");

  // This device's image placeholder, while the panel is open.
  let image;
  // An image replaced by another choice while the panel is open, with its full image, restored
  // if Image is chosen again. A stray arrow key on the modes should not lose someone's picture.
  let replacedImage;
  // Image was chosen, but no file yet.
  let choosingImage = false;
  // The dark background to return to from a color or image.
  let darkBackground = "blend";

  const swatches = BACKGROUND_COLORS.map(([color, name]) => {
    const swatch = document.createElement("button");

    swatch.type = "button";
    swatch.className = "swatch";
    swatch.setAttribute("role", "radio");
    swatch.value = color;
    swatch.dataset.i18nLabel = name;
    swatch.style.setProperty("--swatch", color);

    return swatch;
  });

  find("background-colors").prepend(...swatches);

  function currentMode(preferences) {
    if (image || choosingImage) {
      return "image";
    }

    return preferences.background === "color" ? "color" : "default";
  }

  function showMessage(key) {
    if (key) {
      message.dataset.i18n = key;
    } else {
      delete message.dataset.i18n;
      message.textContent = "";
    }
  }

  // Another choice replaces the image; the synced background shows again. The full image is
  // read before it is deleted, and IndexedDB runs the two in that order.
  function replaceImage() {
    if (image) {
      const placeholder = image;

      replacedImage = readStoredImage()
        .then((record) => record && { blob: record.blob, placeholder })
        .catch(() => undefined);
      image = undefined;
      void removeBackgroundImage();
    }

    choosingImage = false;
    showMessage();
  }

  async function keepImage(result) {
    try {
      await saveBackgroundImage(result);
    } catch {
      showMessage(IMAGE_ERRORS.storage);

      return;
    }

    image = result.placeholder;
    replacedImage = undefined;
    choosingImage = false;
    showMessage();
  }

  function sync() {
    const preferences = getPreferences();
    const mode = currentMode(preferences);

    if (DARK_BACKGROUNDS.includes(preferences.background)) {
      darkBackground = preferences.background;
    }

    for (const radio of modes) {
      radio.checked = radio.value === mode;
    }

    for (const panel of panels) {
      panel.hidden = panel.dataset.backgroundPanel !== mode;
    }

    find("background").value = darkBackground;

    // One swatch takes focus in the group; arrow keys move between them.
    const selected = swatches.find((swatch) => swatch.value === preferences.backgroundColor);
    const focusable = selected ?? swatches[0];

    for (const swatch of swatches) {
      swatch.setAttribute("aria-checked", String(mode === "color" && swatch === selected));
      swatch.tabIndex = swatch === focusable ? 0 : -1;
    }

    // The custom tile shows a color that is not a preset. Chromium passes a new value on to an
    // open picker, so write it only when it changed elsewhere, never during a drag.
    if (colorInput.value !== preferences.backgroundColor) {
      colorInput.value = preferences.backgroundColor;
    }

    customSwatch.classList.toggle("is-selected", mode === "color" && !selected);
    customSwatch.style.setProperty(
      "--swatch",
      selected ? "transparent" : preferences.backgroundColor,
    );

    preview.hidden = !image;
    removeButton.hidden = !image;

    if (!image) {
      preview.removeAttribute("src");
    } else if (preview.src !== image.thumbnail) {
      preview.src = image.thumbnail;
    }
  }

  async function chooseMode(mode) {
    switch (mode) {
      case "default":
        replaceImage();
        await onChange("background", darkBackground);
        break;

      case "color":
        replaceImage();
        await onChange("background", "color");
        break;

      case "image": {
        const replaced = await replacedImage;

        if (replaced) {
          await keepImage(replaced);
        } else {
          choosingImage = true;
        }

        break;
      }
    }
  }

  function chooseColor(color, settled = true) {
    replaceImage();
    onChange("backgroundColor", color, settled);
  }

  for (const radio of modes) {
    radio.addEventListener("change", async () => {
      await chooseMode(radio.value);
      onUpdate();
    });
  }

  find("background").addEventListener("change", async (event) => {
    await onChange("background", event.target.value);
    onUpdate();
  });

  for (const swatch of swatches) {
    swatch.addEventListener("click", () => {
      chooseColor(swatch.value);
      onUpdate();
    });
  }

  // Like native radios, arrow keys move through the presets and choose each one.
  find("background-colors").addEventListener("keydown", (event) => {
    const index = swatches.indexOf(event.target);

    if (index === -1) {
      return;
    }

    const targets = {
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      Home: 0,
      End: swatches.length - 1,
    };

    if (!Object.hasOwn(targets, event.key)) {
      return;
    }

    event.preventDefault();

    const next = swatches.at(targets[event.key] % swatches.length);

    chooseColor(next.value);
    onUpdate();
    next.focus();
  });

  // The picker reports every step of a drag, which previews at once and syncs after a pause like
  // a typed font name; closing the picker syncs the final color at once.
  colorInput.addEventListener("input", () => {
    chooseColor(colorInput.value, false);
    onUpdate();
  });

  colorInput.addEventListener("change", () => {
    chooseColor(colorInput.value);
    onUpdate();
  });

  fileInput.addEventListener("change", async () => {
    const [file] = fileInput.files;

    fileInput.value = "";

    if (!file) {
      return;
    }

    showMessage();
    fileInput.closest(".image-button").setAttribute("aria-busy", "true");

    try {
      await keepImage(await importBackgroundImage(file));
    } catch (error) {
      const code = error?.code;

      showMessage(Object.hasOwn(IMAGE_ERRORS, code) ? IMAGE_ERRORS[code] : "imageReadError");
    } finally {
      fileInput.closest(".image-button").removeAttribute("aria-busy");
    }

    onUpdate();
  });

  removeButton.addEventListener("click", () => {
    void removeBackgroundImage();
    image = undefined;
    replacedImage = undefined;
    choosingImage = false;
    showMessage();
    onUpdate();

    // The button is gone, so move focus to the mode that now shows.
    modes.find((radio) => radio.checked)?.focus();
  });

  return {
    sync,

    // Reads this device's image again, such as when another tab changed it.
    load() {
      image = loadBackgroundImage();
    },

    // Choices that wait for a file last only while the panel is open.
    reset() {
      choosingImage = false;
      replacedImage = undefined;
      showMessage();
      this.load();
    },
  };
}
