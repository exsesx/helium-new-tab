import { searchDestination } from "./address.js";

export async function resolveSearchDestination(value) {
  const destination = searchDestination(value);

  if (!destination.query || !/(?:^|\s)!\S+/.test(destination.query)) {
    return destination;
  }

  // Load the bundled catalog only when the input contains a bang.
  const { resolveBang } = await import("./bangs.js");

  return resolveBang(destination.query) ?? destination;
}
