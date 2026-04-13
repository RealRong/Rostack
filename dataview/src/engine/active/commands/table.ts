import {
  resolveDisplayInsertBeforeFieldId,
  setTableColumnWidths,
  setTableVerticalLines
} from '@dataview/core/view'
import type { ViewApi } from '../../contracts/public'
import type { ViewBaseContext } from './base'

export const createTableApi = (input: {
  base: ViewBaseContext
  display: ViewApi['display']
}): ViewApi['table'] => ({
  setColumnWidths: widths => {
    input.base.withView(view => {
      input.base.commitPatch({
        options: setTableColumnWidths(view.options, widths)
      })
    })
  },
  setVerticalLines: value => {
    input.base.withView(view => {
      input.base.commitPatch({
        options: setTableVerticalLines(view.options, value)
      })
    })
  },
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
