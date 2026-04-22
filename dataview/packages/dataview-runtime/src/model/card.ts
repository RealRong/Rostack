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
  ItemPlacement
} from '@dataview/engine'
import { equal, store } from '@shared/core'
import type {
  CardContent,
  CardProperty
} from '@dataview/runtime/model/shared'
import {
  EngineSource
} from '@dataview/runtime/source'

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

export const createRecordCardPropertiesStore = (input: {
  source: EngineSource
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
  source: EngineSource
  viewType: 'gallery' | 'kanban'
  properties: store.KeyedReadStore<RecordId, readonly CardProperty[] | undefined>
  placeholderText: (input: {
    itemId: ItemId
    item: ItemPlacement
    record: DataRecord
  }) => string
}): store.KeyedReadStore<ItemId, CardContent | undefined> => store.createKeyedDerivedStore({
  get: itemId => {
    if (store.read(input.source.active.view.type) !== input.viewType) {
      return undefined
    }

    const item = store.read(input.source.active.items.read.placement, itemId)
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
