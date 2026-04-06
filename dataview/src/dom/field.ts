import type { ViewFieldRef } from '@dataview/engine/projection/view'

export interface FieldAnchor {
  x: number
  y: number
  width: number
}

export const FIELD_VIEW_ID_ATTR = 'data-value-editor-view-id'
export const FIELD_APPEARANCE_ID_ATTR = 'data-value-editor-appearance-id'
export const FIELD_RECORD_ID_ATTR = 'data-value-editor-record-id'
export const FIELD_FIELD_ID_ATTR = 'data-value-editor-field-id'

const fieldSelector = `[${FIELD_VIEW_ID_ATTR}]`

export const fieldAnchor = (
  element?: Element | null
): FieldAnchor | undefined => {
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
): FieldAnchor | undefined => {
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
  [FIELD_FIELD_ID_ATTR]: field.fieldId
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
      node.dataset.valueEditorViewId === field.viewId
      && node.dataset.valueEditorAppearanceId === field.appearanceId
      && node.dataset.valueEditorRecordId === field.recordId
      && node.dataset.valueEditorFieldId === field.fieldId
    ) {
      return node
    }
  }

  return null
}

export const resolveFieldAnchor = (
  doc: Document | undefined,
  field: ViewFieldRef
): FieldAnchor | undefined => (
  fieldAnchor(fieldElement(doc, field))
)

export const ownerDocumentOf = (
  element?: Element | null
) => element instanceof HTMLElement
  ? element.ownerDocument
  : typeof document === 'undefined'
    ? undefined
    : document
