// Hands out a token to each background choice. A choice that takes a while, such as importing an
// image, keeps its result only while its token is still the latest one, so a newer choice always
// wins over one that finishes later.
export function createChoices() {
  let latest = 0;

  return {
    // Starts a choice and supersedes every earlier one.
    begin() {
      latest++;

      return latest;
    },

    isCurrent(token) {
      return token === latest;
    },
  };
}
