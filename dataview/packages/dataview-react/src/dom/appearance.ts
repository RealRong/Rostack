import type { ItemId } from '@dataview/engine'
import {
  itemDomBridge
} from '@dataview/react/dom/item'

export const DATAVIEW_APPEARANCE_ID_ATTR = 'data-dataview-appearance-id'

export const dataviewAppearanceSelector = `[${DATAVIEW_APPEARANCE_ID_ATTR}]`

export const parseItemIdValue = (
  value: string | null
): ItemId | undefined => {
  if (!value) {
    return undefined
  }

  const itemId = Number(value)
  return Number.isFinite(itemId)
    ? itemId
    : undefined
}

export const parseDataviewAppearanceId = (
  value: string | null
) => parseItemIdValue(value)

export const closestDataviewAppearanceId = (
  target: EventTarget | null
) => (
  itemDomBridge.read.closest(target)
  ?? (
    target instanceof Element
      ? parseDataviewAppearanceId(
          target.closest(dataviewAppearanceSelector)?.getAttribute(DATAVIEW_APPEARANCE_ID_ATTR) ?? null
        )
      : undefined
  )
)
