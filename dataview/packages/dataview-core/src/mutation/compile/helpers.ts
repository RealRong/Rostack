import type {
  FieldId,
  RecordId,
  View,
} from '@dataview/core/types'
import {
  TITLE_FIELD_ID
} from '@dataview/core/types'
import {
  equal,
} from '@shared/core'
import type {
  MutationOrderedAnchor,
} from '@shared/mutation'
import type {
  DataviewMutationWriter,
} from '../model'
import {
  readViewFieldIds,
} from '../../view/fields'
import {
  readViewOrderIds,
} from '../../view/order'

export const END_ANCHOR: MutationOrderedAnchor = {
  kind: 'end'
}

export const toAnchor = (
  before?: string
): MutationOrderedAnchor => before === undefined
  ? END_ANCHOR
  : {
      kind: 'before',
      itemId: before
    }

export const replaceViewFieldsInWriter = (
  writer: DataviewMutationWriter,
  viewId: string,
  currentFieldIds: readonly FieldId[],
  nextFieldIds: readonly FieldId[]
) => {
  currentFieldIds.forEach((fieldId) => {
    writer.view(viewId).fields.delete(fieldId)
  })
  nextFieldIds.forEach((fieldId) => {
    writer.view(viewId).fields.insert(fieldId, END_ANCHOR)
  })
}

export const replaceViewOrderInWriter = (
  writer: DataviewMutationWriter,
  viewId: string,
  currentRecordIds: readonly RecordId[],
  nextRecordIds: readonly RecordId[]
) => {
  currentRecordIds.forEach((recordId) => {
    writer.view(viewId).order.delete(recordId)
  })
  nextRecordIds.forEach((recordId) => {
    writer.view(viewId).order.insert(recordId, END_ANCHOR)
  })
}

export const writeRecordValues = (
  writer: DataviewMutationWriter,
  recordIds: readonly RecordId[],
  input: {
    set?: Partial<Record<FieldId, unknown>>
    clear?: readonly FieldId[]
  }
) => {
  recordIds.forEach((recordId) => {
    Object.entries(input.set ?? {}).forEach(([fieldId, value]) => {
      if (fieldId === TITLE_FIELD_ID) {
        writer.record.patch(recordId, {
          title: structuredClone(value) as string
        })
        return
      }

      writer.record(recordId).values.set(fieldId as FieldId, structuredClone(value))
    })
    ;(input.clear ?? []).forEach((fieldId) => {
      if (fieldId === TITLE_FIELD_ID) {
        writer.record.patch(recordId, {
          title: ''
        })
        return
      }

      writer.record(recordId).values.remove(fieldId)
    })
  })
}

export const writeViewUpdate = (
  writer: DataviewMutationWriter,
  current: View,
  next: View
) => {
  const patch: Record<string, unknown> = {}
  if (current.name !== next.name) {
    patch.name = next.name
  }
  if (current.type !== next.type) {
    patch.type = next.type
  }
  if (!equal.sameJsonValue(current.search, next.search)) {
    patch.search = structuredClone(next.search)
  }
  if (!equal.sameJsonValue(current.filter, next.filter)) {
    patch.filter = structuredClone(next.filter)
  }
  if (!equal.sameJsonValue(current.sort, next.sort)) {
    patch.sort = structuredClone(next.sort)
  }
  if (!equal.sameJsonValue(current.group, next.group)) {
    patch.group = next.group === undefined
      ? undefined
      : structuredClone(next.group)
  }
  if (!equal.sameJsonValue(current.calc, next.calc)) {
    patch.calc = structuredClone(next.calc)
  }
  if (!equal.sameJsonValue(current.options, next.options)) {
    patch.options = structuredClone(next.options)
  }
  if (Object.keys(patch).length > 0) {
    writer.view.patch(current.id, patch)
  }

  const currentFieldIds = readViewFieldIds(current)
  const nextFieldIds = readViewFieldIds(next)
  if (!equal.sameOrder(currentFieldIds, nextFieldIds)) {
    replaceViewFieldsInWriter(
      writer,
      current.id,
      currentFieldIds,
      nextFieldIds
    )
  }

  const currentOrderIds = readViewOrderIds(current)
  const nextOrderIds = readViewOrderIds(next)
  if (!equal.sameOrder(currentOrderIds, nextOrderIds)) {
    replaceViewOrderInWriter(
      writer,
      current.id,
      currentOrderIds,
      nextOrderIds
    )
  }
}
