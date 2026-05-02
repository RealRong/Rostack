import type {
  CustomField,
  CustomFieldId,
  DataDoc,
  DataRecord,
  Field,
  FieldId,
  FieldOption,
  FlatOption,
  RecordId,
  StatusOption,
  View,
  ViewId,
} from '@dataview/core/types'
import {
  TITLE_FIELD_ID
} from '@dataview/core/types'
import {
  field as fieldApi
} from '@dataview/core/field'
import {
  fieldOption
} from '@dataview/core/field/options'
import {
  replaceViewFields,
  readViewFieldIds
} from '@dataview/core/view/fields'
import {
  readViewOrderIds,
  replaceViewOrder
} from '@dataview/core/view/order'
import {
  entityTable
} from '@shared/core'
import {
  defineMutationSchema,
  dictionary,
  sequence,
  object,
  singleton,
  collection,
  value,
  type MutationDeltaOf,
  type MutationReader,
  type MutationWriter,
} from '@shared/mutation'

const appendMissingIds = <TId extends string>(
  previous: readonly TId[],
  nextById: Readonly<Record<string, unknown>>
): TId[] => {
  const nextIds = previous.filter((id) => nextById[id] !== undefined)
  const seen = new Set(nextIds)

  Object.keys(nextById).forEach((id) => {
    if (seen.has(id as TId)) {
      return
    }

    nextIds.push(id as TId)
    seen.add(id as TId)
  })

  return nextIds
}

const writeTableById = <
  TKey extends 'records' | 'fields' | 'views',
  TId extends string
>(
  document: DataDoc,
  key: TKey,
  nextById: Readonly<Record<string, unknown>>
): DataDoc => {
  const current = document[key]
  const nextIds = appendMissingIds<TId>(current.ids as unknown as readonly TId[], nextById)

  return {
    ...document,
    [key]: {
      byId: nextById,
      ids: nextIds
    }
  } as DataDoc
}

const readFieldOptions = (
  document: DataDoc,
  fieldId: CustomFieldId
): readonly FieldOption[] => {
  const field = document.fields.byId[fieldId]
  if (!fieldApi.kind.hasOptions(field)) {
    throw new Error(`Field ${fieldId} does not support options.`)
  }

  return fieldOption.read.list(field)
}

const writeFieldOptions = (
  document: DataDoc,
  fieldId: CustomFieldId,
  options: readonly FieldOption[]
): DataDoc => {
  const field = document.fields.byId[fieldId]
  if (!fieldApi.kind.hasOptions(field)) {
    throw new Error(`Field ${fieldId} does not support options.`)
  }

  const nextOptions = options.map((option) => structuredClone(option))
  return {
    ...document,
    fields: entityTable.write.put(document.fields, (
      field.kind === 'status'
        ? {
            ...field,
            options: nextOptions.flatMap((option) => ('category' in option
              ? [{
                  id: option.id,
                  name: option.name,
                  color: option.color ?? null,
                  category: option.category
                } satisfies StatusOption]
              : []))
          }
        : {
            ...field,
            options: nextOptions.map((option) => ({
              id: option.id,
              name: option.name,
              color: option.color ?? null
            } satisfies FlatOption))
          }
    ))
  }
}

const readViewOrder = (
  document: DataDoc,
  viewId: ViewId
): readonly RecordId[] => {
  const view = document.views.byId[viewId]
  if (!view) {
    throw new Error(`View ${viewId} not found.`)
  }

  return readViewOrderIds(view)
}

const writeViewOrder = (
  document: DataDoc,
  viewId: ViewId,
  order: readonly RecordId[]
): DataDoc => {
  const view = document.views.byId[viewId]
  if (!view) {
    throw new Error(`View ${viewId} not found.`)
  }

  return {
    ...document,
    views: entityTable.write.put(document.views, {
      ...view,
      order: replaceViewOrder(order)
    })
  }
}

const readViewFields = (
  document: DataDoc,
  viewId: ViewId
): readonly FieldId[] => {
  const view = document.views.byId[viewId]
  if (!view) {
    throw new Error(`View ${viewId} not found.`)
  }

  return readViewFieldIds(view)
}

const writeViewFields = (
  document: DataDoc,
  viewId: ViewId,
  fieldIds: readonly FieldId[]
): DataDoc => {
  const view = document.views.byId[viewId]
  if (!view) {
    throw new Error(`View ${viewId} not found.`)
  }

  return {
    ...document,
    views: entityTable.write.put(document.views, {
      ...view,
      fields: replaceViewFields(fieldIds)
    })
  }
}

export const dataviewMutationSchema = defineMutationSchema<DataDoc>()({
  document: singleton<DataDoc, DataDoc>()({
    access: {
      read: (document) => document,
      write: (_document, next) => next as DataDoc
    },
    members: {
      schemaVersion: value<DataDoc['schemaVersion']>(),
      activeViewId: value<DataDoc['activeViewId']>(),
      meta: object<NonNullable<DataDoc['meta']>>()
    },
    changes: ({ value, object }) => ({
      schemaVersion: [value('schemaVersion')],
      activeViewId: [value('activeViewId')],
      meta: [object('meta').deep()]
    })
  }),
  record: collection<DataDoc, RecordId, DataRecord>()({
    access: {
      read: (document) => document.records.byId,
      write: (document, next) => writeTableById<'records', RecordId>(
        document,
        'records',
        next as Readonly<Record<string, unknown>>
      )
    },
    members: {
      title: value<DataRecord['title']>(),
      type: value<DataRecord['type']>(),
      values: dictionary<CustomFieldId, unknown>({ at: 'values' }),
      meta: object<NonNullable<DataRecord['meta']>>()
    },
    changes: ({ value, dictionary, object }) => ({
      title: [value('title')],
      type: [value('type')],
      values: [dictionary('values').deep()],
      meta: [object('meta').deep()]
    })
  }),
  field: collection<DataDoc, CustomFieldId, CustomField>()({
    access: {
      read: (document) => document.fields.byId,
      write: (document, next) => writeTableById<'fields', CustomFieldId>(
        document,
        'fields',
        next as Readonly<Record<string, unknown>>
      )
    },
    members: {
      name: value<CustomField['name']>(),
      kind: value<CustomField['kind']>(),
      system: value<boolean>(),
      displayFullUrl: value<boolean>(),
      format: value<Extract<CustomField, { kind: 'number' }>['format']>(),
      precision: value<Extract<CustomField, { kind: 'number' }>['precision']>(),
      currency: value<Extract<CustomField, { kind: 'number' }>['currency']>(),
      useThousandsSeparator: value<Extract<CustomField, { kind: 'number' }>['useThousandsSeparator']>(),
      defaultOptionId: value<Extract<CustomField, { kind: 'status' }>['defaultOptionId']>(),
      displayDateFormat: value<Extract<CustomField, { kind: 'date' }>['displayDateFormat']>(),
      displayTimeFormat: value<Extract<CustomField, { kind: 'date' }>['displayTimeFormat']>(),
      defaultValueKind: value<Extract<CustomField, { kind: 'date' }>['defaultValueKind']>(),
      defaultTimezone: value<Extract<CustomField, { kind: 'date' }>['defaultTimezone']>(),
      multiple: value<Extract<CustomField, { kind: 'asset' }>['multiple']>(),
      accept: value<Extract<CustomField, { kind: 'asset' }>['accept']>(),
      meta: object<NonNullable<CustomField['meta']>>()
    },
    changes: ({ value, object }) => ({
      name: [value('name')],
      kind: [value('kind')],
      system: [value('system')],
      displayFullUrl: [value('displayFullUrl')],
      format: [value('format')],
      precision: [value('precision')],
      currency: [value('currency')],
      useThousandsSeparator: [value('useThousandsSeparator')],
      defaultOptionId: [value('defaultOptionId')],
      displayDateFormat: [value('displayDateFormat')],
      displayTimeFormat: [value('displayTimeFormat')],
      defaultValueKind: [value('defaultValueKind')],
      defaultTimezone: [value('defaultTimezone')],
      multiple: [value('multiple')],
      accept: [value('accept')],
      meta: [object('meta').deep()]
    }),
    sequence: {
      options: sequence<FieldOption>()({
        read: readFieldOptions,
        write: writeFieldOptions,
        identify: (option) => option.id,
        emits: 'options'
      })
    }
  }),
  view: collection<DataDoc, ViewId, View>()({
    access: {
      read: (document) => document.views.byId,
      write: (document, next) => writeTableById<'views', ViewId>(
        document,
        'views',
        next as Readonly<Record<string, unknown>>
      )
    },
    members: {
      name: value<View['name']>(),
      type: value<View['type']>(),
      search: value<View['search']>(),
      filter: value<View['filter']>(),
      sort: value<View['sort']>(),
      group: value<View['group']>(),
      calc: value<View['calc']>(),
      options: value<View['options']>()
    },
    changes: ({ value, object }) => ({
      name: [value('name')],
      type: [value('type')],
      search: [value('search')],
      filter: [value('filter')],
      sort: [value('sort')],
      group: [value('group')],
      calc: [value('calc')],
      options: [value('options')]
    }),
    sequence: {
      fields: sequence<FieldId>()({
        read: readViewFields,
        write: writeViewFields,
        identify: (fieldId) => fieldId,
        emits: 'fields'
      }),
      order: sequence<RecordId>()({
        read: readViewOrder,
        write: writeViewOrder,
        identify: (recordId) => recordId,
        emits: 'order'
      })
    }
  })
})

export type DataviewMutationSchema = typeof dataviewMutationSchema
export type DataviewMutationWriter = MutationWriter<DataviewMutationSchema>
export type DataviewMutationReader = MutationReader<DataviewMutationSchema>
export type DataviewMutationDelta = MutationDeltaOf<DataviewMutationSchema>

const TITLE_FIELD: Extract<Field, { kind: 'title' }> = {
  id: TITLE_FIELD_ID,
  name: 'Title',
  kind: 'title',
  system: true
}

export const dataviewTitleField = TITLE_FIELD
