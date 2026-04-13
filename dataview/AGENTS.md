# UI Conventions

- In the UI layer, prefer existing components from `@shared/ui/*` whenever they fit the use case.
- Use `Button`, `Input`, `Select`, `Label`, and `Popover` from `@shared/ui/*` instead of raw HTML controls when an equivalent component already exists.
- Do not introduce a raw `<input>`, `<button>`, `<select>`, or `<label>` in `dataview/packages/dataview-react/src/**` if the same interaction can be expressed with an existing `@shared/ui/*` component.
- If a screen needs a repeated control pattern that `@shared/ui/*` does not support cleanly, extend `shared/ui/src` first instead of copy-pasting one-off utility class stacks across feature code.
- Do not pass visual `className` overrides into `Button` from feature code. Prefer semantic props such as `variant`, `layout`, `leading`, `suffix`, `trailing`, `pressed`, and `tone`.
- For `Input`, start from the shared `@shared/ui/input` styling. Avoid overriding core visual styles with ad hoc `className` values unless the UI pattern is intentionally special-purpose.
