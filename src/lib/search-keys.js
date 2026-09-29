// What a keydown outside the search field does to it.
export const SEARCH_KEY_ACTIONS = {
  none: "none",
  // Focus the field and swallow the key, as `/` does.
  focus: "focus",
  // Focus the field and let the browser type the key into it.
  type: "type",
};

const EDITABLE = "input, textarea, select, [contenteditable]";

// Runs on every keydown, so the cheapest checks come first and the DOM is queried last.
export function searchKeyAction(event, { typeToSearch, hasQuery, isDialogOpen }) {
  const modified = event.ctrlKey || event.metaKey || event.altKey;
  const printable = event.key.length === 1;

  if (modified || event.isComposing || !printable) {
    return SEARCH_KEY_ACTIONS.none;
  }

  if (event.target.matches(EDITABLE) || isDialogOpen()) {
    return SEARCH_KEY_ACTIONS.none;
  }

  if (event.key === "/") {
    return SEARCH_KEY_ACTIONS.focus;
  }

  if (!typeToSearch) {
    return SEARCH_KEY_ACTIONS.none;
  }

  // A leading space would only be trimmed, and Space still presses a focused button.
  const keepsSpace = !hasQuery || event.target.matches("button");

  if (event.key === " " && keepsSpace) {
    return SEARCH_KEY_ACTIONS.none;
  }

  return SEARCH_KEY_ACTIONS.type;
}
