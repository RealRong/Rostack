import type {
  FieldId
} from '@dataview/core/contracts'
import type {
  CellRef,
  ItemId
} from '@dataview/engine/contracts/shared'
import type {
  ActiveViewReadApi,
  ViewCell,
  ViewState
} from '@dataview/engine/contracts/view'
import type { DocumentReader } from '@dataview/engine/document/reader'

export const createActiveViewReadApi = (input: {
  reader: DocumentReader
  state: () => ViewState | undefined
}): ActiveViewReadApi => {
  const readState = () => input.state()
  const readField = (fieldId: FieldId) => input.reader.fields.get(fieldId)
  const readSection = (sectionId: string) => readState()?.sections.get(sectionId)
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
      sectionId: placement.sectionId,
      record,
      field: readField(cell.fieldId),
      value: input.reader.values.get(placement.recordId, cell.fieldId)
    }
  }

  return {
    record: recordId => input.reader.records.get(recordId),
    field: readField,
    section: readSection,
    placement: readPlacement,
    cell: readCell
  }
}
