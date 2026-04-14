import { resolveWhiteboardPaletteValue } from '@whiteboard/core/node'

export const resolvePaletteColor = (
  value: string | null | undefined
) => resolveWhiteboardPaletteValue(value) ?? value ?? undefined

export const resolvePaletteColorOr = (
  value: string | null | undefined,
  fallback: string | null | undefined
) => resolvePaletteColor(value) ?? resolvePaletteColor(fallback)

export const resolvePalettePaint = <
  TPaint extends {
    fill?: string | null
    stroke?: string | null
    color?: string | null
  }
>(paint: TPaint) => ({
  ...paint,
  fill: resolvePaletteColor(paint.fill),
  stroke: resolvePaletteColor(paint.stroke),
  color: resolvePaletteColor(paint.color)
})

export const resolvePalettePreviewColor = resolvePaletteColor
