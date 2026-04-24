import {
  field as fieldApi
} from '@dataview/core/field'
import type {
  CustomField,
  RecordId,
  TitleField
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
  CardProperty
} from '@dataview/runtime/model/shared'
import {
  EngineSource
} from '@dataview/runtime/source'

const EMPTY_CUSTOM_FIELDS = [] as readonly CustomField[]

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

const sameTitle = (
  left: CardContent['title'],
  right: CardContent['title']
) => left === right || (
  !!left
  && !!right
  && left.field === right.field
  && left.value === right.value
)

const sameContent = (
  left: CardContent | undefined,
  right: CardContent | undefined
) => left === right || (
  !!left
  && !!right
  && sameTitle(left.title, right.title)
  && left.hasProperties === right.hasProperties
  && sameProperties(left.properties, right.properties)
)

export const createVisibleCustomFieldsStore = (input: {
  source: EngineSource
}): store.ReadStore<readonly CustomField[]> => store.createDerivedStore({
  get: () => {
    const fields = store.read(input.source.active.fields.list).all
    const customFields = fields.filter(fieldApi.kind.isCustom)
    return customFields.length
      ? customFields
      : EMPTY_CUSTOM_FIELDS
  },
  isEqual: equal.sameOrder
})

export const createVisibleTitleFieldStore = (input: {
  source: EngineSource
}): store.ReadStore<TitleField | undefined> => store.createDerivedStore({
  get: () => {
    const field = store.read(input.source.active.fields, TITLE_FIELD_ID)
    return field && field.kind === 'title'
      ? field
      : undefined
  },
  isEqual: Object.is
})

export const createRecordCardPropertiesStore = (input: {
  source: EngineSource
  fields: store.ReadStore<readonly CustomField[]>
}): store.KeyedReadStore<RecordId, readonly CardProperty[] | undefined> => store.createKeyedDerivedStore<RecordId, readonly CardProperty[] | undefined>({
  get: recordId => {
    const record = store.read(input.source.document.records, recordId)
    if (!record) {
      return undefined
    }

    return store.read(input.fields).map<CardProperty>(field => ({
      field,
      value: store.read(input.source.document.values, {
        recordId,
        fieldId: field.id
      })
    }))
  },
  isEqual: sameProperties
})

export const createItemCardContentStore = (input: {
  source: EngineSource
  viewType: 'gallery' | 'kanban'
  properties: store.KeyedReadStore<RecordId, readonly CardProperty[] | undefined>
  titleField: store.ReadStore<TitleField | undefined>
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

    const titleField = store.read(input.titleField)

    return {
      ...(titleField
        ? {
            title: {
              field: titleField,
              value: String(titleValue)
            }
          }
        : {}),
      properties,
      hasProperties: properties.some(property => !fieldApi.value.empty(property.value))
    }
  },
  isEqual: sameContent
})
