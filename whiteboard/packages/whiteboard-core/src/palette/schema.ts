export type WhiteboardPaletteGroup =
  | 'bg'
  | 'sticky'
  | 'border'
  | 'text'

export type WhiteboardPaletteKey = `palette:${WhiteboardPaletteGroup}:${number}`

const PALETTE_KEY_RE = /^palette:(bg|sticky|border|text):(\d+)$/

export const createWhiteboardPaletteKey = (
  group: WhiteboardPaletteGroup,
  index: number
): WhiteboardPaletteKey => `palette:${group}:${index}`

export const parseWhiteboardPaletteKey = (
  value: string | null | undefined
): {
  group: WhiteboardPaletteGroup
  index: number
} | undefined => {
  if (typeof value !== 'string') {
    return undefined
  }

  const match = PALETTE_KEY_RE.exec(value.trim())
  if (!match) {
    return undefined
  }

  const [, group, rawIndex] = match
  const index = Number(rawIndex)
  if (!Number.isInteger(index) || index < 0) {
    return undefined
  }

  return {
    group: group as WhiteboardPaletteGroup,
    index
  }
}

export const isWhiteboardPaletteKey = (
  value: string | null | undefined
): value is WhiteboardPaletteKey => parseWhiteboardPaletteKey(value) !== undefined

export const resolveWhiteboardPaletteVariable = (
  group: WhiteboardPaletteGroup,
  index: number
) => `var(--wb-palette-${group}-${index})`

export const resolveWhiteboardPaletteValue = (
  value: string | null | undefined
) => {
  const parsed = parseWhiteboardPaletteKey(value)

  return parsed
    ? resolveWhiteboardPaletteVariable(parsed.group, parsed.index)
    : value ?? undefined
}
