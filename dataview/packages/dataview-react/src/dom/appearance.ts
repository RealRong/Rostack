import type { ItemId } from '@dataview/engine'

export const DATAVIEW_APPEARANCE_ID_ATTR = 'data-dataview-appearance-id'

export const dataviewAppearanceSelector = `[${DATAVIEW_APPEARANCE_ID_ATTR}]`

export const parseItemIdValue = (
  value: string | null
): ItemId | undefined => {
  if (!value) {
    return undefined
  }

  const parsed = Number(value)
  return Number.isSafeInteger(parsed)
    ? parsed as ItemId
    : undefined
}

export const parseDataviewAppearanceId = (
  value: string | null
) => parseItemIdValue(value)

export const closestDataviewAppearanceId = (
  target: EventTarget | null
) => (
  target instanceof Element
    ? parseDataviewAppearanceId(
        target.closest(dataviewAppearanceSelector)?.getAttribute(DATAVIEW_APPEARANCE_ID_ATTR) ?? null
      )
    : undefined
)
