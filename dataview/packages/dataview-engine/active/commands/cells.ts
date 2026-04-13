import type { ActiveViewApi } from '../../contracts/public'
import type { ActiveViewContext } from '../context'

export const createCellsApi = (input: {
  base: ActiveViewContext
  read: ActiveViewApi['read']
}): ActiveViewApi['cells'] => ({
  set: (cell, value) => {
    const state = input.base.readState()
    if (!state) {
      return
    }

    const target = input.read.cell(cell)
    if (!target) {
      return
    }

    input.base.recordsApi.values.set(target.recordId, target.fieldId, value)
  },
  clear: cell => {
    const state = input.base.readState()
    if (!state) {
      return
    }

    const target = input.read.cell(cell)
    if (!target) {
      return
    }

    input.base.recordsApi.values.clear(target.recordId, target.fieldId)
  }
})
