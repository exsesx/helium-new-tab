// Service icons come from the browser's own favicon cache, so typing sends no requests.
const PERMISSION = { permissions: ["favicon"] };

export function serviceIconsSupported() {
  return (
    typeof chrome !== "undefined" &&
    typeof chrome.permissions?.request === "function" &&
    typeof chrome.runtime?.getURL === "function"
  );
}

// Call directly from a user action so the browser can show its permission prompt.
export async function requestServiceIcons() {
  if (!serviceIconsSupported()) {
    return false;
  }

  try {
    return await chrome.permissions.request(PERMISSION);
  } catch {
    return false;
  }
}

export async function hasServiceIcons() {
  if (!serviceIconsSupported()) {
    return false;
  }

  try {
    return await chrome.permissions.contains(PERMISSION);
  } catch {
    return false;
  }
}

export function onServiceIconsRevoked(listener) {
  if (!serviceIconsSupported()) {
    return;
  }

  chrome.permissions.onRemoved?.addListener(({ permissions = [] }) => {
    if (permissions.includes("favicon")) {
      listener();
    }
  });
}

export function serviceIconUrl(origin) {
  const url = new URL(chrome.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", origin);
  url.searchParams.set("size", "32");

  return url.href;
}
