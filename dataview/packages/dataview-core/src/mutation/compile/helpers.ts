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
  MutationSequenceAnchor,
} from '@shared/mutation'
import type {
  DataviewMutationWriter,
} from '../schema'
import {
  readViewFieldIds,
} from '../../view/fields'
import {
  readViewOrderIds,
} from '../../view/order'

export const END_ANCHOR: MutationSequenceAnchor = {
  at: 'end'
}

export const toAnchor = (
  before?: string
): MutationSequenceAnchor => before === undefined
  ? END_ANCHOR
  : {
      before
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
        writer.records(recordId).patch({
          title: structuredClone(value) as string
        })
        return
      }

      writer.records(recordId).values.set(fieldId as FieldId, structuredClone(value))
    })
    ;(input.clear ?? []).forEach((fieldId) => {
      if (fieldId === TITLE_FIELD_ID) {
        writer.records(recordId).patch({
          title: ''
        })
        return
      }

      writer.records(recordId).values.delete(fieldId)
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
    writer.views(current.id).patch(patch)
  }

  const currentFieldIds = readViewFieldIds(current)
  const nextFieldIds = readViewFieldIds(next)
  if (!equal.sameOrder(currentFieldIds, nextFieldIds)) {
    writer.views(current.id).fields.replace(nextFieldIds)
  }

  const currentOrderIds = readViewOrderIds(current)
  const nextOrderIds = readViewOrderIds(next)
  if (!equal.sameOrder(currentOrderIds, nextOrderIds)) {
    writer.views(current.id).order.replace(nextOrderIds)
  }
}
