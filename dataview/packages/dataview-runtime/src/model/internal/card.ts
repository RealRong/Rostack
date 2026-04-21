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
import { equal, store } from '@shared/core'
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
  && equal.sameValue(left.value, right.value)

const sameProperties = (
  left: readonly CardProperty[] | undefined,
  right: readonly CardProperty[] | undefined
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && equal.sameOrder(left, right, sameProperty)
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
): store.ReadStore<readonly CustomField[]> => createEntityListStore({
  ids: source.active.fields.custom.ids,
  values: source.active.fields.custom
})

export const createRecordCardPropertiesStore = (input: {
  source: DataViewSource
  fields: store.ReadStore<readonly CustomField[]>
}): store.KeyedReadStore<RecordId, readonly CardProperty[] | undefined> => store.createKeyedDerivedStore<RecordId, readonly CardProperty[] | undefined>({
  get: recordId => {
    const record = store.read(input.source.doc.records, recordId)
    if (!record) {
      return undefined
    }

    return store.read(input.fields).map<CardProperty>(field => ({
      field,
      value: record.values[field.id]
    }))
  },
  isEqual: sameProperties
})

export const createItemCardContentStore = (input: {
  source: DataViewSource
  viewType: 'gallery' | 'kanban'
  properties: store.KeyedReadStore<RecordId, readonly CardProperty[] | undefined>
  placeholderText: (input: {
    itemId: ItemId
    item: ViewItem
    record: DataRecord
  }) => string
}): store.KeyedReadStore<ItemId, CardContent | undefined> => store.createKeyedDerivedStore({
  get: itemId => {
    if (store.read(input.source.active.view.type) !== input.viewType) {
      return undefined
    }

    const item = store.read(input.source.active.items, itemId)
    if (!item) {
      return undefined
    }

    const record = store.read(input.source.doc.records, item.recordId)
    const properties = store.read(input.properties, item.recordId)
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
