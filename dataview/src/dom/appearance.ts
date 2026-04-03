export const DATAVIEW_APPEARANCE_ID_ATTR = 'data-dataview-appearance-id'

export const dataviewAppearanceSelector = `[${DATAVIEW_APPEARANCE_ID_ATTR}]`

export const closestDataviewAppearanceId = (
  target: EventTarget | null
) => (
  target instanceof Element
    ? target.closest(dataviewAppearanceSelector)?.getAttribute(DATAVIEW_APPEARANCE_ID_ATTR)
    : null
)
