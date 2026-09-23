import { searchDestination } from "./address.js";
import { createBangResolver } from "./bangs.js";

// The build writes a compact catalog here; tests read the full source snapshot.
const CATALOG_URL = new URL("../data/bangs.json", import.meta.url);
let resolverRequest;

// Fetch and parse the catalog only when the input contains a bang. Retry after failures.
function loadBangResolver() {
  resolverRequest ??= fetch(CATALOG_URL)
    .then((response) => {
      if (!response.ok) {
        throw new Error("Bang catalog unavailable");
      }

      return response.json();
    })
    .then(createBangResolver)
    .catch((error) => {
      resolverRequest = undefined;
      throw error;
    });

  return resolverRequest;
}

export async function resolveSearchDestination(value) {
  const destination = searchDestination(value);

  if (!destination.query || !/(?:^|\s)!\S+/.test(destination.query)) {
    return destination;
  }

  const resolveBang = await loadBangResolver();

  return resolveBang(destination.query) ?? destination;
}
