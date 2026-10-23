import { hasServiceIcons, markIconTone, serviceIconUrl } from "./service-icons.js";

const BOOKMARK_PERMISSION = { permissions: ["bookmarks"] };
const BAR_PERMISSIONS = { permissions: ["bookmarks", "favicon"] };
const SAFE_PROTOCOLS = new Set(["http:", "https:", "ftp:", "file:", "chrome:", "about:"]);

export function bookmarksSupported() {
  return typeof globalThis.chrome?.permissions?.request === "function";
}

// Called from the settings switch, before any await, to retain the user gesture.
export async function requestBookmarks() {
  try {
    return bookmarksSupported() && (await chrome.permissions.request(BAR_PERMISSIONS));
  } catch {
    return false;
  }
}

// Chromium 134+ identifies bar folders explicitly (including account bookmarks). Older
// Chromium uses the permanent folder ID "1". Never match localized folder names.
export function bookmarksBarLinks(tree) {
  const roots = tree.flatMap((root) => root.children ?? []);
  const bars = roots.filter((node) => node.folderType === "bookmarks-bar");
  const folders = bars.length > 0 ? bars : roots.filter((node) => node.id === "1");
  const links = [];

  function visit(nodes, path = []) {
    for (const node of nodes) {
      if (!node.url) {
        visit(node.children ?? [], [...path, node.title]);
        continue;
      }

      try {
        const url = new URL(node.url);

        if (SAFE_PROTOCOLS.has(url.protocol)) {
          links.push({
            id: node.id,
            url: url.href,
            title: node.title.trim() || url.hostname || url.href,
            folder: path.filter(Boolean).join(" / "),
          });
        }
      } catch {
        // Skip malformed addresses and executable bookmarklets.
      }
    }
  }

  for (const folder of folders) {
    visit(folder.children ?? []);
  }

  return links;
}

function bookmarkIcon(url, showIcons, size) {
  const icon = document.createElement("span");
  icon.className = "bookmark-icon";
  icon.setAttribute("aria-hidden", "true");
  // A local globe remains visible for bookmarks without a cached favicon.
  icon.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></svg>';

  if (showIcons) {
    const image = new Image(size, size);
    image.alt = "";
    image.className = "site-favicon";
    image.addEventListener("load", () => {
      markIconTone(image);
      icon.replaceChildren(image);
    });
    image.src = serviceIconUrl(url, globalThis.devicePixelRatio || 1, size);
  }

  return icon;
}

// Bookmark contents stay in memory. Only the per-device visibility preference is saved.
export function createBookmarksBar({ container, getEnabled, getStyle, translator, onRevoked }) {
  let revision = 0;
  let listening = false;
  let timer;

  function message(key) {
    const text = document.createElement("p");
    text.className = "bookmarks-message";
    text.dataset.i18n = key;
    text.textContent = translator.text(key);
    container.replaceChildren(text);
  }

  function listen() {
    if (listening || !globalThis.chrome?.bookmarks) {
      return;
    }

    listening = true;

    for (const event of [
      "onCreated",
      "onRemoved",
      "onChanged",
      "onMoved",
      "onChildrenReordered",
      "onImportEnded",
    ]) {
      chrome.bookmarks[event]?.addListener(() => {
        clearTimeout(timer);
        timer = setTimeout(() => void refresh(), 60);
      });
    }
  }

  async function refresh() {
    const request = ++revision;
    container.hidden = !getEnabled();
    const style = getStyle();
    container.dataset.style = style;

    if (!getEnabled()) {
      container.replaceChildren();

      return;
    }

    try {
      const granted =
        bookmarksSupported() && (await chrome.permissions.contains(BOOKMARK_PERMISSION));

      if (request !== revision) {
        return;
      }

      if (!granted) {
        onRevoked();

        return;
      }

      listen();
      const [tree, showIcons] = await Promise.all([chrome.bookmarks.getTree(), hasServiceIcons()]);

      if (request !== revision) {
        return;
      }

      const bookmarks = bookmarksBarLinks(tree);

      if (bookmarks.length === 0) {
        message("bookmarksEmpty");

        return;
      }

      const focusedId = document.activeElement?.closest(".bookmark-link")?.dataset.bookmarkId;
      const list = document.createElement("ul");

      for (const bookmark of bookmarks) {
        const item = document.createElement("li");
        const link = document.createElement("a");
        const title = document.createElement("span");

        link.className = "bookmark-link";
        link.dataset.bookmarkId = bookmark.id;
        link.href = bookmark.url;
        link.rel = "noreferrer";
        link.title = [bookmark.folder, bookmark.title, bookmark.url].filter(Boolean).join("\n");
        title.className = "bookmark-title";
        title.textContent = bookmark.title;
        link.append(bookmarkIcon(bookmark.url, showIcons, style === "tiles" ? 32 : 16), title);
        item.append(link);
        list.append(item);
      }

      const scrollLeft = container.scrollLeft;
      container.replaceChildren(list);
      container.scrollLeft = scrollLeft;

      if (focusedId) {
        [...list.querySelectorAll("a")]
          .find((link) => link.dataset.bookmarkId === focusedId)
          ?.focus();
      }
    } catch {
      if (request === revision) {
        message("bookmarksError");
      }
    }
  }

  globalThis.chrome?.permissions?.onRemoved?.addListener(({ permissions = [] }) => {
    if (permissions.includes("bookmarks")) {
      onRevoked();
    } else if (permissions.includes("favicon")) {
      void refresh();
    }
  });

  globalThis.chrome?.permissions?.onAdded?.addListener(({ permissions = [] }) => {
    if (permissions.includes("favicon")) {
      void refresh();
    }
  });

  return { refresh };
}
