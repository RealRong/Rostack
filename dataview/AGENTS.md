# UI Conventions

- In the UI layer, prefer existing components from `src/react/ui` whenever they fit the use case.
- Use `Button`, `Input`, `Select`, `Label`, and `Popover` from `src/react/ui` instead of raw HTML controls when an equivalent component already exists.
- Do not introduce a raw `<input>`, `<button>`, `<select>`, or `<label>` in `src/react/**` if the same interaction can be expressed with an existing `src/react/ui` component.
- If a screen needs a repeated control pattern that `src/react/ui` does not support cleanly, extend `src/react/ui` first instead of copy-pasting one-off utility class stacks across feature code.
- Do not pass visual `className` overrides into `Button` from feature code. Prefer semantic props such as `variant`, `layout`, `leading`, `suffix`, `trailing`, `pressed`, and `tone`.
- For `Input`, start from the shared `src/react/ui/input.tsx` styling. Avoid overriding core visual styles with ad hoc `className` values unless the UI pattern is intentionally special-purpose.
