const TARGETS = [
  ["data-i18n", null],
  ["data-i18n-label", "aria-label"],
  ["data-i18n-placeholder", "placeholder"],
];

// Fills in the text, labels, and placeholders marked with data-i18n attributes. Text that is
// already right is left alone, so translating the page again changes nothing.
export function translate(root, message) {
  for (const [attribute, target] of TARGETS) {
    for (const element of root.querySelectorAll(`[${attribute}]`)) {
      const text = message(element.getAttribute(attribute))?.replace(
        "{font}",
        element.dataset.fontExample ?? "Inter",
      );

      if (text === undefined) {
        continue;
      }

      if (target && element.getAttribute(target) !== text) {
        element.setAttribute(target, text);
      } else if (!target && element.textContent !== text) {
        element.textContent = text;
      }
    }
  }
}
