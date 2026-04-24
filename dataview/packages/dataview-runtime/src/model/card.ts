import {
  field as fieldApi
} from '@dataview/core/field'
import {
  document as documentApi
} from '@dataview/core/document'
import type {
  CustomField,
  RecordId
} from '@dataview/core/contracts'
import {
  TITLE_FIELD_ID
} from '@dataview/core/contracts'
import type {
  ItemId,
  ItemPlacement
} from '@dataview/engine'
import { equal, store } from '@shared/core'
import type {
  CardContent,
  CardTitle,
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
  && left.title.field === right.title.field
  && left.title.value === right.title.value
  && left.title.placeholderText === right.title.placeholderText
  && left.hasProperties === right.hasProperties
  && sameProperties(left.properties, right.properties)
)

export const createRecordCardPropertiesStore = (input: {
  source: EngineSource
  propertyFields: store.ReadStore<readonly CustomField[]>
}): store.KeyedReadStore<RecordId, readonly CardProperty[] | undefined> => store.createKeyedDerivedStore<RecordId, readonly CardProperty[] | undefined>({
  get: recordId => {
    const record = store.read(input.source.document.records, recordId)
    if (!record) {
      return undefined
    }

    return store.read(input.propertyFields).map<CardProperty>(field => ({
      field,
      value: store.read(input.source.document.values, {
        recordId,
        fieldId: field.id
      })
    }))
  },
  isEqual: sameProperties
})

const TITLE_FIELD = documentApi.fields.title.get()

export const createItemCardContentStore = (input: {
  source: EngineSource
  viewType: 'gallery' | 'kanban'
  properties: store.KeyedReadStore<RecordId, readonly CardProperty[] | undefined>
  placeholderText: (input: {
    itemId: ItemId
    item: ItemPlacement
  }) => string
}): store.KeyedReadStore<ItemId, CardContent | undefined> => store.createKeyedDerivedStore({
  get: itemId => {
    if (store.read(input.source.active.viewType) !== input.viewType) {
      return undefined
    }

    const item = store.read(input.source.active.items.read.placement, itemId)
    if (!item) {
      return undefined
    }

    const properties = store.read(input.properties, item.recordId)
    const titleValue = store.read(input.source.document.values, {
      recordId: item.recordId,
      fieldId: TITLE_FIELD_ID
    })
    if (titleValue === undefined || !properties) {
      return undefined
    }

    const title: CardTitle = {
      field: TITLE_FIELD,
      value: String(titleValue),
      placeholderText: input.placeholderText({
        itemId,
        item
      })
    }

    return {
      title,
      properties,
      hasProperties: properties.some(property => !fieldApi.value.empty(property.value))
    }
  },
  isEqual: sameContent
})
