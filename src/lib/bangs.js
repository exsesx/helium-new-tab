const flags = { openBasePath: 1, encodeQuery: 4, spaceToPlus: 8 };
const defaultFormat = flags.openBasePath | flags.encodeQuery | flags.spaceToPlus;

// Keep only the fields the resolver reads: aliases, URL template and format flags.
export function compactCatalog(entries) {
  return entries.map(({ ts, u, f }) => (f === undefined ? { ts, u } : { ts, u, f }));
}

export function createBangResolver(catalog) {
  const bangs = new Map();

  for (const entry of catalog) {
    for (const trigger of entry.ts) {
      if (!bangs.has(trigger.toLowerCase())) {
        bangs.set(trigger.toLowerCase(), entry);
      }
    }
  }

  return function resolveBang(text) {
    const match = /(?:^|\s)!(\S+)/u.exec(text);
    const entry = match && bangs.get(match[1].toLowerCase());

    if (!entry) {
      return null;
    }

    const query = [
      text.slice(0, match.index).trim(),
      text.slice(match.index + match[0].length).trim(),
    ]
      .filter(Boolean)
      .join(" ");

    try {
      const template = new URL(entry.u);
      const dynamicHost = template.hostname.toLowerCase().includes("{searchterms}");

      if (dynamicHost && !query) {
        return null;
      }

      const format = entry.f ?? defaultFormat;
      let terms = format & flags.encodeQuery ? encodeURIComponent(query) : query;

      if (format & flags.spaceToPlus) {
        terms = terms.replaceAll(format & flags.encodeQuery ? "%20" : " ", "+");
      }

      const url =
        !query && format & flags.openBasePath
          ? new URL("/", template)
          : new URL(entry.u.replaceAll("{searchTerms}", () => terms));

      if (
        !["https:", "http:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.hostname.startsWith(".") ||
        url.hostname.includes("..") ||
        (dynamicHost &&
          !url.hostname
            .split(".")
            .every((label) => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label)))
      ) {
        return null;
      }

      return {
        url: url.href,
        // Never send query-derived hostnames while the user is still typing.
        favicon: dynamicHost
          ? ""
          : `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(template.origin)}&sz=64`,
      };
    } catch {
      // Some bangs put the query in a hostname, where spaces are invalid.
    }

    return null;
  };
}
