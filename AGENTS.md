# Code readability

Favor code that is easy to scan and change over minimizing line count. Apply these
rules to authored source, scripts, tests, and configuration.

- Separate logical blocks with a blank line: setup, validation, work, and results.
  Keep closely related declarations and assignments together.
- Add a blank line before a `return` when another statement precedes it in the
  same block. A block containing only a return needs no extra spacing.
- Separate independent conditions, loops, functions, and event handlers with blank
  lines. Use guard clauses when they make the remaining flow easier to follow.
- Use `switch` for branches that select behavior based on one value. Separate
  case bodies with blank lines; keep grouped case labels together. Preserve the
  existing fallback behavior.
- Use lookup objects for simple value mappings. Handle unknown keys explicitly,
  including inherited property names when keys come from external input.
- Use shared named constants or enum-like objects when the same set of choices
  appears in several places. Reuse existing definitions rather than duplicating
  them or introducing a new type system just for enums.
- Keep simple two-way ternaries short. Replace nested ternaries with explicit
  control flow, and give complex conditions descriptive names.
- In tests, separate setup, actions, and assertions. Give each subsequent scenario
  its own visual grouping.
- Separate HTML sections, CSS rules, and workflow steps so their boundaries are
  visible. Preserve meaningful HTML whitespace and CSS declaration order.

For readability-only changes, preserve behavior and keep unrelated edits out of
the change. Review the formatted diff to confirm the logical grouping still reads
clearly.
