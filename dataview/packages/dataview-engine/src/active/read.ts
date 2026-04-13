import type {
  FieldId
} from '@dataview/core/contracts'
import {
  getDocumentFieldById
} from '@dataview/core/document'
import { read, type ReadStore } from '@shared/core'
import type {
  ActiveViewReadApi,
  CellRef,
  DocumentSelectApi,
  ViewCell,
  ViewState
} from '#dataview-engine/contracts/public'

export const createActiveViewReadApi = (input: {
  select: DocumentSelectApi
  state: ReadStore<ViewState | undefined>
}): ActiveViewReadApi => {
  const readDocument = () => read(input.select.document)
  const readState = () => read(input.state)
  const readField = (fieldId: FieldId) => getDocumentFieldById(readDocument(), fieldId)
  const readSection = (sectionKey: string) => readState()?.sections.get(sectionKey)
  const readItem = (itemId: string) => readState()?.items.get(itemId)
  const readCell = (cell: CellRef): ViewCell | undefined => {
    const state = readState()
    if (!state) {
      return undefined
    }

    const item = state.items.get(cell.itemId)
    if (!item) {
      return undefined
    }

    const record = read(input.select.records.byId, item.recordId)
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
    record: recordId => read(input.select.records.byId, recordId),
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
        ?? (rule?.fieldId
          ? readField(rule.fieldId)
          : undefined)
    }
  }
}
