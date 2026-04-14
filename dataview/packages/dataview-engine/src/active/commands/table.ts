import {
  resolveDisplayInsertBeforeFieldId,
  setTableColumnWidths,
  setTableVerticalLines
} from '@dataview/core/view'
import type { ActiveViewApi } from '@dataview/engine/contracts/public'
import type { ActiveViewContext } from '@dataview/engine/active/context'
import { withViewPatch } from '@dataview/engine/active/commands/shared'

export const createTableApi = (input: {
  base: ActiveViewContext
  display: ActiveViewApi['display']
}): ActiveViewApi['table'] => ({
  setColumnWidths: widths => withViewPatch(input.base, view => ({
    options: setTableColumnWidths(view.options, widths)
  })),
  setVerticalLines: value => withViewPatch(input.base, view => ({
    options: setTableVerticalLines(view.options, value)
  })),
  insertFieldLeft: (anchorFieldId, fieldInput) => {
    const fieldId = input.base.createField(fieldInput)
    if (!fieldId) {
      return undefined
    }

    input.display.show(
      fieldId,
      resolveDisplayInsertBeforeFieldId(
        input.base.readConfig()?.display.fields ?? [],
        anchorFieldId,
        'left'
      )
    )
    return fieldId
  },
  insertFieldRight: (anchorFieldId, fieldInput) => {
    const fieldId = input.base.createField(fieldInput)
    if (!fieldId) {
      return undefined
    }

    input.display.show(
      fieldId,
      resolveDisplayInsertBeforeFieldId(
        input.base.readConfig()?.display.fields ?? [],
        anchorFieldId,
        'right'
      )
    )
    return fieldId
  }
})
