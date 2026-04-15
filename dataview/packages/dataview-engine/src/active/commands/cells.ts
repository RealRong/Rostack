import type { ActiveViewApi } from '@dataview/engine/contracts/public'
import type { ActiveViewContext } from '@dataview/engine/active/context'

export const createCellsApi = (input: {
  base: ActiveViewContext
  read: ActiveViewApi['read']
}): ActiveViewApi['cells'] => ({
  set: (cell, value) => {
    const target = input.read.cell(cell)
    if (!target) {
      return
    }

    input.base.dispatch({
      type: 'record.fields.writeMany',
      input: {
        recordIds: [target.recordId],
        set: {
          [target.fieldId]: value
        }
      }
    })
  },
  clear: cell => {
    const target = input.read.cell(cell)
    if (!target) {
      return
    }

    input.base.dispatch({
      type: 'record.fields.writeMany',
      input: {
        recordIds: [target.recordId],
        clear: [target.fieldId]
      }
    })
  }
})
