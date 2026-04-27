import type {
  CalculationEntry,
  FieldReducerState,
  ReducerCapabilitySet
} from '@dataview/core/view'
import {
  calculation
} from '@dataview/core/view'
import type {
  RecordId
} from '@dataview/core/types'
import type {
  ReadColumn
} from '@dataview/engine/active/shared/rows'
import {
  readDenseColumn
} from '@dataview/engine/active/shared/rows'
import type {
  Selection
} from '@dataview/engine/active/shared/selection'

const EMPTY_ENTRIES = new Map<RecordId, CalculationEntry>()

const collectEntries = (input: {
  selection: Selection
  column: ReadColumn<CalculationEntry>
}): ReadonlyMap<RecordId, CalculationEntry> => {
  const ids = input.selection.ids
  if (!ids.length) {
    return EMPTY_ENTRIES
  }

  const next = new Map<RecordId, CalculationEntry>()
  for (let index = 0; index < ids.length; index += 1) {
    const recordId = ids[index]!
    const entry = input.column.get(recordId)
    if (entry) {
      next.set(recordId, entry)
    }
  }
  return next
}

export const reduce = {
  summary: (input: {
    selection: Selection
    column: ReadColumn<CalculationEntry> | undefined
    capabilities: ReducerCapabilitySet
  }): FieldReducerState => {
    if (!input.column || !input.selection.indexes.length) {
      return calculation.state.empty(input.capabilities)
    }

    const dense = readDenseColumn(input.column)
    if (dense) {
      const fullDenseSelection = (
        input.selection.ids === input.selection.rows.ids
        && input.selection.indexes.length === dense.length
      )
      return calculation.state.build({
        entriesByIndex: dense,
        ...(fullDenseSelection
          ? {}
          : {
              recordIndexes: input.selection.indexes
            }),
        capabilities: input.capabilities
      })
    }

    return calculation.state.build({
      entries: collectEntries({
        selection: input.selection,
        column: input.column
      }),
      recordIds: input.selection.ids,
      capabilities: input.capabilities
    })
  }
}
