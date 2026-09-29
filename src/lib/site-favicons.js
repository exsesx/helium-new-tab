import { cachedServiceIconUrl, markIconTone } from "./service-icons.js";

// Matches the .site-favicon width in style.css.
const FAVICON_SIZE = 24;

// Swaps letter tiles for the browser's cached favicons. Sites without one keep their letter.
export function showSiteFavicons(root) {
  const icons = [...root.querySelectorAll(".site-icon:not(.has-favicon)")];

  return Promise.all(
    icons.map(async (icon) => {
      const source = await cachedServiceIconUrl(
        icon.dataset.origin,
        globalThis.devicePixelRatio || 1,
        FAVICON_SIZE,
      );

      if (!source) {
        return;
      }

      const image = new Image();
      image.alt = "";
      image.className = "site-favicon";
      image.src = source;

      try {
        await image.decode();
      } catch {
        return;
      }

      markIconTone(image);
      icon.classList.add("has-favicon");
      icon.replaceChildren(image);
    }),
  );
}
