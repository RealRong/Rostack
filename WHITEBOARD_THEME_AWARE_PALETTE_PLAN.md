# Whiteboard Theme-Aware Palette Plan

## Goal

Build a whiteboard-specific palette system that:

- uses the colors defined in [colors.md](./colors.md) as the source of truth
- supports automatic light/dark switching
- powers fill, border, and text color panels independently
- keeps sticky notes visually consistent between menu preview, toolbar swatch, and actual rendered nodes
- avoids storing theme-fixed hex values like `#FFFFFF` in node styles
- avoids coupling persisted node data to CSS variable names

## Problem

The current whiteboard color flow is based on `shared/ui/css/tokens.css` semantic families and values such as:

- `var(--ui-*-surface)`
- `var(--ui-*-surface-pressed)`
- `var(--ui-*-border-strong)`
- `var(--ui-*-text-secondary)`

That is suitable for general UI semantics, but not for a dense drawing palette like classic whiteboard colors.

If a node stores a literal hex value, for example:

```ts
style.fill = '#FFFFFF'
```

the value is theme-fixed and cannot switch automatically when the theme changes.

## Final Direction

Use `colors.md` as the palette data source, but do not write raw hex values into whiteboard node styles.

Instead:

1. Define whiteboard palette CSS variables for light and dark themes.
2. Define stable persisted palette keys for `bg`, `border`, and `text`.
3. Make color panels select palette keys, not literal hex values.
4. Resolve palette keys to CSS variable references at render time or before applying styles.

```ts
style.fill = 'palette:bg:12'
style.stroke = 'palette:border:7'
style.color = 'palette:text:15'
```

When the theme switches, only the variable definitions change. Existing nodes update automatically without data migration, and palette variable names can evolve independently from persisted data.

## Source Of Truth

Use [colors.md](./colors.md) as the source for three independent palettes:

- `BG`: for fill colors and sticky background colors
- `BORDER`: for border/stroke colors
- `TEXT`: for text colors

These three palettes do not need strict 1:1 pairing.

This is intentional:

- fill panel only needs background colors
- border panel only needs stroke colors
- text panel only needs text colors
- sticky presets may choose to use `BG` only, with `BORDER` and `TEXT` as optional enhancements

## Palette Model

The implementation should treat palette groups independently.

Recommended conceptual model:

```ts
type WhiteboardPaletteGroup = 'bg' | 'border' | 'text'

type WhiteboardPaletteTheme = 'light' | 'dark'

type WhiteboardPaletteToken = {
  id: string
  group: WhiteboardPaletteGroup
  index: number
  variable: string
  key: string
}
```

Recommended ids:

- `bg.0`, `bg.1`, `bg.2`, ...
- `border.0`, `border.1`, `border.2`, ...
- `text.0`, `text.1`, `text.2`, ...

Recommended persisted keys:

- `palette:bg:0`
- `palette:border:0`
- `palette:text:0`

Resolved CSS variable references:

- `var(--wb-palette-bg-0)`
- `var(--wb-palette-border-0)`
- `var(--wb-palette-text-0)`

## CSS Variable Layer

Add a whiteboard-specific palette variable layer with stable names.

Recommended naming:

- `--wb-palette-bg-0`
- `--wb-palette-bg-1`
- `--wb-palette-bg-2`
- `--wb-palette-border-0`
- `--wb-palette-border-1`
- `--wb-palette-text-0`
- `--wb-palette-text-1`

Define the same variable names in both themes, but give them different values.

Example:

```css
.ui-light-theme {
  --wb-palette-bg-0: #000000;
  --wb-palette-bg-1: #323232;
  --wb-palette-border-0: #000000;
  --wb-palette-text-0: #000000;
}

.ui-dark-theme {
  --wb-palette-bg-0: #ffffff;
  --wb-palette-bg-1: #e5e5e5;
  --wb-palette-border-0: #ffffff;
  --wb-palette-text-0: #ffffff;
}
```

This is the core mechanism that makes theme switching automatic.

## Resolution Layer

Introduce a small resolver between persisted node styles and rendered styles.

Recommended behavior:

1. Detect whether a style value is a palette key.
2. If it is, convert it to a CSS variable reference.
3. If it is already a raw color like `transparent` or `#ff0000`, leave it unchanged.

Conceptual API:

```ts
resolvePaletteStyleValue('palette:bg:12') === 'var(--wb-palette-bg-12)'
resolvePaletteStyleValue('palette:border:7') === 'var(--wb-palette-border-7)'
resolvePaletteStyleValue('#ffffff') === '#ffffff'
resolvePaletteStyleValue('transparent') === 'transparent'
```

This keeps persistence stable while still using CSS variables for theme-aware rendering.

## Transparent Handling

Transparent should not be treated as a normal palette color index.

Recommended handling:

- expose it as a dedicated first swatch in fill-related panels
- store it as `'transparent'`
- do not assign it a numbered palette variable

Reason:

- transparent is a semantic mode, not a palette color
- keeping it separate avoids index shifting and ambiguous behavior

## Panel Integration

### Fill Panel

Target file:

- [whiteboard/packages/whiteboard-react/src/features/selection/chrome/panels/FillPanel.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/selection/chrome/panels/FillPanel.tsx)

Use:

- `transparent`
- `BG` palette from `colors.md`

Do not use `shared/ui` semantic family colors for whiteboard fill once the new palette is introduced.

### Border Panel

Target file:

- [whiteboard/packages/whiteboard-react/src/features/selection/chrome/panels/BorderPanel.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/selection/chrome/panels/BorderPanel.tsx)

Use:

- `BORDER` palette from `colors.md`

Keep the current stroke width / dash / opacity controls. Only replace the color source.

### Text Color Panel

Target file:

- [whiteboard/packages/whiteboard-react/src/features/selection/chrome/panels/TextColorPanel.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/selection/chrome/panels/TextColorPanel.tsx)

Use:

- `TEXT` palette from `colors.md`

Keep `Ink` only if it remains a meaningful separate semantic action. Otherwise it can be absorbed into the palette if desired.

## Sticky Strategy

Sticky should be treated as a product-specific subset of the broader fill palette.

### Sticky Menu

Target file:

- [whiteboard/packages/whiteboard-react/src/features/toolbox/menus/StickyMenu.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/toolbox/menus/StickyMenu.tsx)

Recommended rule:

- sticky menu shows a curated subset of `BG`
- fill panel may show the full fill palette

This keeps toolbox UI compact while preserving a richer fill picker after selection.

### Sticky Node Styles

Sticky background should also store palette variable references, for example:

```ts
style.fill = 'palette:bg:12'
```

This ensures:

- sticky menu preview
- toolbar swatch
- fill panel
- actual sticky card rendering

all resolve from the same palette source.

### Sticky Border And Text

Sticky does not require strict per-color pairing.

Recommended initial behavior:

- background comes from `BG`
- text remains `var(--ui-text-primary)` unless there is a clear reason to promote text palette usage
- border may remain a stable neutral stroke, or later move to a curated `BORDER` subset if needed

This keeps the first implementation simple while still allowing future enhancement.

## Persistence Strategy

### Recommended

Persist palette keys in node styles:

```ts
style.fill = 'palette:bg:12'
style.stroke = 'palette:border:5'
style.color = 'palette:text:9'
```

Advantages:

- automatic theme switching
- CSS variable names can change without rewriting persisted node data
- no migration needed when the active theme changes
- consistent behavior across canvas, panels, and preview components
- keeps palette semantics separate from CSS implementation details

### Not Recommended

Persist raw hex values from `colors.md`:

```ts
style.fill = '#FFFFFF'
```

This breaks theme awareness because the stored color is already resolved.

### Also Not Recommended

Persist CSS variable references directly:

```ts
style.fill = 'var(--wb-palette-bg-12)'
```

This is workable short-term, but it couples persisted data to CSS variable naming. If variable naming, grouping, or indexing changes later, stored node data becomes harder to evolve.

## Suggested Implementation Order

1. Create whiteboard palette constants derived from `colors.md`.
2. Add theme-specific CSS variables for `bg`, `border`, and `text`.
3. Add a palette key parser and resolver.
4. Replace current whiteboard panel color options with palette-key options.
5. Update sticky presets to use palette-key fill values.
6. Update toolbar swatches and menu previews to consume the same palette data through the resolver.
7. Verify that light/dark switching updates existing nodes without rewriting node data.

## Acceptance Criteria

The implementation is correct when all of the following are true:

- existing whiteboard nodes using the new palette switch colors automatically when the theme changes
- fill panel colors come from the `BG` palette in `colors.md`
- border panel colors come from the `BORDER` palette in `colors.md`
- text color panel colors come from the `TEXT` palette in `colors.md`
- sticky menu colors match actual sticky rendering closely
- toolbar color swatches match the selected node styles
- transparent fill is available as a dedicated option and does not consume a numbered palette slot
- persisted node data does not depend on CSS variable names

## Scope Boundary

This plan intentionally does not replace all of `shared/ui/css/tokens.css`.

`tokens.css` should remain the semantic UI foundation for the product.
The new whiteboard palette layer is a product-specific drawing palette that sits on top of the UI token system.
