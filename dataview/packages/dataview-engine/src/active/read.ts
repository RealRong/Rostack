import type {
  FieldId
} from '@dataview/core/contracts'
import { store } from '@shared/core'
import type {
  ActiveViewReadApi,
  CellRef,
  ItemId,
  ViewCell,
  ViewState
} from '@dataview/engine/contracts'
import type { DocumentReader } from '@dataview/engine/document/reader'

export const createActiveViewReadApi = (input: {
  reader: DocumentReader
  stateStore: store.ReadStore<ViewState | undefined>
}): ActiveViewReadApi => {
  const readState = () => store.read(input.stateStore)
  const readField = (fieldId: FieldId) => input.reader.fields.get(fieldId)
  const readSection = (sectionKey: string) => readState()?.sections.get(sectionKey)
  const readPlacement = (itemId: ItemId) => readState()?.items.read.placement(itemId)
  const readCell = (cell: CellRef): ViewCell | undefined => {
    const state = readState()
    if (!state) {
      return undefined
    }

    const placement = state.items.read.placement(cell.itemId)
    if (!placement) {
      return undefined
    }

    const record = input.reader.records.get(placement.recordId)
    if (!record) {
      return undefined
    }

    return {
      itemId: cell.itemId,
      recordId: placement.recordId,
      fieldId: cell.fieldId,
      sectionKey: placement.sectionKey,
      record,
      field: readField(cell.fieldId),
      value: cell.fieldId === 'title'
        ? record.title
        : record.values[cell.fieldId]
    }
  }

  return {
    record: recordId => input.reader.records.get(recordId),
    field: readField,
    section: readSection,
    placement: readPlacement,
    cell: readCell,
    groupField: () => {
      const state = readState()
      if (!state || !state.query.group.active) {
        return undefined
      }

      return state.query.group.field
    },
    filterField: index => {
      const rule = readState()?.query.filters.rules[index]
      return rule?.field
    }
  }
}
