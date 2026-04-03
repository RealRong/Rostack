import type {
  PropertyId
} from '@dataview/core/contracts'
import {
  belowFieldAnchor,
  ownerDocumentOf,
  resolveFieldAnchor
} from '@dataview/dom/field'
import type {
  ViewFieldRef
} from '@dataview/engine/projection/view'
import {
  stepViewFieldByIntent
} from '@dataview/react/field/navigation'
import type {
  CurrentView
} from '@dataview/react/currentView'
import type {
  ValueEditorApi
} from '@dataview/react/page/valueEditor'

export const openCardField = (input: {
  valueEditor: ValueEditorApi
  currentView: Pick<CurrentView, 'appearances'>
  field: ViewFieldRef
  fieldPropertyIds: readonly PropertyId[]
  element?: Element | null
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
    onResolve: result => {
      if (result.kind !== 'commit' || result.intent === 'done') {
        return
      }

      const field = stepViewFieldByIntent({
        field: input.field,
        scope: {
          appearanceIds: [input.field.appearanceId],
          propertyIds: input.fieldPropertyIds
        },
        appearances: input.currentView.appearances,
        intent: result.intent
      })

      if (!field) {
        return
      }

      openCardField({
        ...input,
        field
      })
    }
  })
}
