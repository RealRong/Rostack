import type {
  FieldId
} from '@dataview/core/contracts'
import { read, type ReadStore } from '@shared/core'
import type {
  ActiveViewReadApi,
  CellRef,
  ItemId,
  ViewCell,
  ViewState
} from '@dataview/engine/contracts/public'
import type { DocumentReader } from '@dataview/engine/document/reader'

export const createActiveViewReadApi = (input: {
  reader: DocumentReader
  stateStore: ReadStore<ViewState | undefined>
}): ActiveViewReadApi => {
  const readState = () => read(input.stateStore)
  const readField = (fieldId: FieldId) => input.reader.fields.get(fieldId)
  const readSection = (sectionKey: string) => readState()?.sections.get(sectionKey)
  const readItem = (itemId: ItemId) => readState()?.items.get(itemId)
  const readCell = (cell: CellRef): ViewCell | undefined => {
    const state = readState()
    if (!state) {
      return undefined
    }

    const item = state.items.get(cell.itemId)
    if (!item) {
      return undefined
    }

    const record = input.reader.records.get(item.recordId)
    if (!record) {
      return undefined
    }

    return {
      itemId: cell.itemId,
      recordId: item.recordId,
      fieldId: cell.fieldId,
      sectionKey: item.sectionKey,
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
    item: readItem,
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
