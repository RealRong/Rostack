import {
  belowFieldAnchor,
  ownerDocumentOf,
  resolveFieldAnchor
} from '#react/dom/field.ts'
import type {
  ViewFieldRef
} from '@dataview/engine'
import type {
  ValueEditorApi,
  ValueEditorSessionPolicy
} from '#react/runtime/valueEditor/index.ts'

const createCardSessionPolicy = (focusOwner: () => void): ValueEditorSessionPolicy => ({
  resolveOnCommit: () => ({
    kind: 'focus-owner'
  }),
  applyCloseAction: () => {
    focusOwner()
    return true
  },
  onCancel: focusOwner,
  onDismiss: focusOwner
})

export const openCardField = (input: {
  valueEditor: ValueEditorApi
  field: ViewFieldRef
  element?: Element | null
  seedDraft?: string
  focusOwner: () => void
}): boolean => {
  const anchor = resolveFieldAnchor(
    ownerDocumentOf(input.element),
    input.field
  ) ?? (
      input.element instanceof HTMLElement
        ? belowFieldAnchor(input.element)
        : undefined
    )

  if (!anchor) {
    return false
  }

  return input.valueEditor.open({
    field: input.field,
    anchor,
    seedDraft: input.seedDraft,
    policy: createCardSessionPolicy(input.focusOwner)
  })
}
