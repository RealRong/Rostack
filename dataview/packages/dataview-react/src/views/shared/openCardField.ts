import {
  belowFieldAnchor,
} from '@dataview/react/dom/field'
import type {
  ViewFieldRef
} from '@dataview/engine'
import type {
  ValueEditorApi,
} from '@dataview/runtime/valueEditor'
import {
  createFocusOwnerSessionPolicy,
  openFieldValueEditor
} from '@dataview/react/views/shared/valueEditor'

export const openCardField = (input: {
  valueEditor: ValueEditorApi
  field: ViewFieldRef
  element?: Element | null
  seedDraft?: string
  focusOwner: () => void
}): boolean => {
  return openFieldValueEditor({
    valueEditor: input.valueEditor,
    field: input.field,
    element: input.element,
    seedDraft: input.seedDraft,
    policy: createFocusOwnerSessionPolicy({
      focusOwner: input.focusOwner
    }),
    fallbackAnchor: element => (
      element instanceof HTMLElement
        ? belowFieldAnchor(element)
        : undefined
    )
  })
}
