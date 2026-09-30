import topLevelDomains from "tlds";

// Private network names that no public registry assigns, reached over plain HTTP.
const LOCAL_SUFFIXES = ["localhost", "local", "internal", "lan", "home.arpa"];
const HOST_PATTERN =
  /^(?<host>\[[\da-f:.]+\]|[^\s/?#:@[\]]+)(?::(?<port>\d{1,5}))?(?:[/?#]\S*)?$/iu;
const LABEL_PATTERN = /^[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?$/u;
let knownDomains;

// The normalized http(s) address, or "" for anything else, including login details.
export function websiteUrl(value) {
  const text = value.trim();

  if (!/^https?:\/\//i.test(text) || /\s/.test(text)) {
    return "";
  }

  try {
    const url = new URL(text);

    if (!url.hostname || url.username || url.password) {
      return "";
    }

    return url.href;
  } catch {
    return "";
  }
}

function isIpv4(host) {
  const parts = host.split(".");

  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

function isLocalName(host) {
  return LOCAL_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

function isPublicName(host) {
  const labels = host.split(".");

  if (labels.length < 2 || !labels.every((label) => LABEL_PATTERN.test(label))) {
    return false;
  }

  knownDomains ??= new Set(topLevelDomains);

  return knownDomains.has(labels.at(-1));
}

// Pick the scheme a bare address needs, or nothing when the text reads as a search.
function addressScheme(text) {
  const match = HOST_PATTERN.exec(text);

  if (!match) {
    return null;
  }

  const host = match.groups.host.toLowerCase();

  if (host.startsWith("[") || isIpv4(host) || isLocalName(host)) {
    return "http";
  }

  if (isPublicName(host)) {
    return "https";
  }

  return null;
}

export function searchDestination(value) {
  const text = value.trim();

  if (/^https?:\/\//i.test(text)) {
    const url = websiteUrl(text);

    return url ? { url } : { query: text };
  }

  const scheme = addressScheme(text);

  if (scheme) {
    // Addresses the URL parser rejects are treated as a search.
    const url = websiteUrl(`${scheme}://${text}`);

    if (url) {
      return { url };
    }
  }

  return { query: text };
}
