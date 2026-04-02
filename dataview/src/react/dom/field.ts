import type { ValueEditorAnchor, ViewFieldRef } from './types'

export const FIELD_VIEW_ID_ATTR = 'data-property-edit-view-id'
export const FIELD_APPEARANCE_ID_ATTR = 'data-property-edit-appearance-id'
export const FIELD_RECORD_ID_ATTR = 'data-property-edit-record-id'
export const FIELD_PROPERTY_ID_ATTR = 'data-property-edit-property-id'

const fieldSelector = `[${FIELD_VIEW_ID_ATTR}]`

export const fieldAnchor = (
  element?: Element | null
): ValueEditorAnchor | undefined => {
  if (!(element instanceof HTMLElement)) {
    return undefined
  }

  const rect = element.getBoundingClientRect()
  return {
    x: Math.round(rect.left) - 2.5,
    y: Math.round(rect.top) - 2,
    width: Math.round(rect.width) + 5
  }
}

export const belowFieldAnchor = (
  element?: Element | null
): ValueEditorAnchor | undefined => {
  if (!(element instanceof HTMLElement)) {
    return undefined
  }

  const rect = element.getBoundingClientRect()
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.bottom),
    width: Math.round(rect.width)
  }
}

export const fieldAttrs = (
  field: ViewFieldRef
) => ({
  [FIELD_VIEW_ID_ATTR]: field.viewId,
  [FIELD_APPEARANCE_ID_ATTR]: field.appearanceId,
  [FIELD_RECORD_ID_ATTR]: field.recordId,
  [FIELD_PROPERTY_ID_ATTR]: field.propertyId
})

export const fieldElement = (
  doc: Document | undefined,
  field: ViewFieldRef
): HTMLElement | null => {
  if (!doc) {
    return null
  }

  const nodes = doc.querySelectorAll<HTMLElement>(fieldSelector)
  for (const node of nodes) {
    if (
      node.dataset.propertyEditViewId === field.viewId
      && node.dataset.propertyEditAppearanceId === field.appearanceId
      && node.dataset.propertyEditRecordId === field.recordId
      && node.dataset.propertyEditPropertyId === field.propertyId
    ) {
      return node
    }
  }

  return null
}

export const resolveFieldAnchor = (
  doc: Document | undefined,
  field: ViewFieldRef
): ValueEditorAnchor | undefined => (
  fieldAnchor(fieldElement(doc, field))
)

export const ownerDocumentOf = (
  element?: Element | null
) => element instanceof HTMLElement
  ? element.ownerDocument
  : typeof document === 'undefined'
    ? undefined
    : document
