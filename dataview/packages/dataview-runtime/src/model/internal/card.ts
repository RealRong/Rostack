import {
  field as fieldApi
} from '@dataview/core/field'
import type {
  CustomField,
  DataRecord,
  RecordId
} from '@dataview/core/contracts'
import type {
  ItemId,
  ViewItem
} from '@dataview/engine'
import {
  createKeyedDerivedStore,
  read,
  sameOrder,
  sameValue,
  type KeyedReadStore,
  type ReadStore
} from '@shared/core'
import type {
  DataViewSource
} from '@dataview/runtime/dataview/types'
import type {
  CardContent,
  CardProperty
} from '@dataview/runtime/model/shared'
import {
  createEntityListStore
} from '@dataview/runtime/model/internal/list'

const sameProperty = (
  left: CardProperty,
  right: CardProperty
) => left.field === right.field
  && sameValue(left.value, right.value)

const sameProperties = (
  left: readonly CardProperty[] | undefined,
  right: readonly CardProperty[] | undefined
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && sameOrder(left, right, sameProperty)
  )
)

const sameContent = (
  left: CardContent | undefined,
  right: CardContent | undefined
) => left === right || (
  !!left
  && !!right
  && left.titleText === right.titleText
  && left.placeholderText === right.placeholderText
  && left.hasProperties === right.hasProperties
  && sameProperties(left.properties, right.properties)
)

export const createActiveCustomFieldListStore = (
  source: DataViewSource
): ReadStore<readonly CustomField[]> => createEntityListStore({
  ids: source.active.fields.custom.ids,
  values: source.active.fields.custom
})

export const createRecordCardPropertiesStore = (input: {
  source: DataViewSource
  fields: ReadStore<readonly CustomField[]>
}): KeyedReadStore<RecordId, readonly CardProperty[] | undefined> => createKeyedDerivedStore<RecordId, readonly CardProperty[] | undefined>({
  get: recordId => {
    const record = read(input.source.doc.records, recordId)
    if (!record) {
      return undefined
    }

    return read(input.fields).map<CardProperty>(field => ({
      field,
      value: record.values[field.id]
    }))
  },
  isEqual: sameProperties
})

export const createItemCardContentStore = (input: {
  source: DataViewSource
  viewType: 'gallery' | 'kanban'
  properties: KeyedReadStore<RecordId, readonly CardProperty[] | undefined>
  placeholderText: (input: {
    itemId: ItemId
    item: ViewItem
    record: DataRecord
  }) => string
}): KeyedReadStore<ItemId, CardContent | undefined> => createKeyedDerivedStore({
  get: itemId => {
    if (read(input.source.active.view.type) !== input.viewType) {
      return undefined
    }

    const item = read(input.source.active.items, itemId)
    if (!item) {
      return undefined
    }

    const record = read(input.source.doc.records, item.recordId)
    const properties = read(input.properties, item.recordId)
    if (!record || !properties) {
      return undefined
    }

    return {
      titleText: record.title,
      placeholderText: input.placeholderText({
        itemId,
        item,
        record
      }),
      properties,
      hasProperties: properties.some(property => !fieldApi.value.empty(property.value))
    }
  },
  isEqual: sameContent
})
