import type { ViewApi } from '../../contracts/public'
import type { ViewBaseContext } from './base'

export const createCellsApi = (input: {
  base: ViewBaseContext
  read: ViewApi['read']
}): ViewApi['cells'] => ({
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
