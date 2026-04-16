import type {
  CustomFieldId,
  CustomFieldKind
} from '@dataview/core/contracts'
import {
  resolveDisplayInsertBeforeFieldId,
  setTableColumnWidths,
  setTableVerticalLines,
  setTableWrapCells
} from '@dataview/core/view'
import type { ActiveViewApi } from '@dataview/engine/contracts/public'
import type { ActiveViewContext } from '@dataview/engine/active/context'

const createField = (
  base: ActiveViewContext,
  input?: {
    name?: string
    kind?: CustomFieldKind
  }
): CustomFieldId | undefined => {
  const kind = input?.kind ?? 'text'
  const explicitName = input?.name?.trim()
  const name = explicitName
  if (!name) {
    return undefined
  }

  return base.dispatch({
    type: 'field.create',
    input: {
      name,
      kind
    }
  }).created?.fields?.[0]
}

export const createTableApi = (input: {
  base: ActiveViewContext
  display: ActiveViewApi['display']
}): ActiveViewApi['table'] => ({
  setColumnWidths: widths => input.base.patch(view => ({
    options: setTableColumnWidths(view.options, widths)
  })),
  setVerticalLines: value => input.base.patch(view => ({
    options: setTableVerticalLines(view.options, value)
  })),
  setWrapCells: value => input.base.patch(view => ({
    options: setTableWrapCells(view.options, value)
  })),
  insertFieldLeft: (anchorFieldId, fieldInput) => {
    const fieldId = createField(input.base, fieldInput)
    if (!fieldId) {
      return undefined
    }

    input.display.show(
      fieldId,
      resolveDisplayInsertBeforeFieldId(
        input.base.view()?.display.fields ?? [],
        anchorFieldId,
        'left'
      )
    )
    return fieldId
  },
  insertFieldRight: (anchorFieldId, fieldInput) => {
    const fieldId = createField(input.base, fieldInput)
    if (!fieldId) {
      return undefined
    }

    input.display.show(
      fieldId,
      resolveDisplayInsertBeforeFieldId(
        input.base.view()?.display.fields ?? [],
        anchorFieldId,
        'right'
      )
    )
    return fieldId
  }
})
