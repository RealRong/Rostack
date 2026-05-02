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
  defineMutationModel,
  keyed,
  ordered,
  record,
  singleton,
  tableFamily,
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

export const dataviewMutationModel = defineMutationModel<DataDoc>()({
  document: singleton<DataDoc, DataDoc>()({
    access: {
      read: (document) => document,
      write: (_document, next) => next as DataDoc
    },
    members: {
      schemaVersion: value<DataDoc['schemaVersion']>(),
      activeViewId: value<DataDoc['activeViewId']>(),
      meta: record<NonNullable<DataDoc['meta']>>()
    },
    changes: ({ value, record }) => ({
      schemaVersion: [value('schemaVersion')],
      activeViewId: [value('activeViewId')],
      meta: [record('meta').deep()]
    })
  }),
  record: tableFamily<DataDoc, RecordId, DataRecord>()({
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
      values: keyed<CustomFieldId, unknown>({ at: 'values' }),
      meta: record<NonNullable<DataRecord['meta']>>()
    },
    changes: ({ value, keyed, record }) => ({
      title: [value('title')],
      type: [value('type')],
      values: [keyed('values').deep()],
      meta: [record('meta').deep()]
    })
  }),
  field: tableFamily<DataDoc, CustomFieldId, CustomField>()({
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
      meta: record<NonNullable<CustomField['meta']>>()
    },
    changes: ({ value, record }) => ({
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
      meta: [record('meta').deep()]
    }),
    ordered: {
      options: ordered<FieldOption>()({
        read: readFieldOptions,
        write: writeFieldOptions,
        identify: (option) => option.id,
        emits: 'options'
      })
    }
  }),
  view: tableFamily<DataDoc, ViewId, View>()({
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
      search: record<View['search']>(),
      filter: record<View['filter']>(),
      sort: record<View['sort']>(),
      group: record<View['group']>(),
      calc: record<View['calc']>(),
      options: record<View['options']>()
    },
    changes: ({ value, record }) => ({
      name: [value('name')],
      type: [value('type')],
      search: [record('search').deep()],
      filter: [record('filter').deep()],
      sort: [record('sort').deep()],
      group: [record('group').deep()],
      calc: [record('calc').deep()],
      options: [record('options').deep()]
    }),
    ordered: {
      fields: ordered<FieldId>()({
        read: readViewFields,
        write: writeViewFields,
        identify: (fieldId) => fieldId,
        emits: 'fields'
      }),
      order: ordered<RecordId>()({
        read: readViewOrder,
        write: writeViewOrder,
        identify: (recordId) => recordId,
        emits: 'order'
      })
    }
  })
})

export type DataviewMutationModel = typeof dataviewMutationModel
export type DataviewMutationWriter<Tag extends string = string> = MutationWriter<DataviewMutationModel, Tag>
export type DataviewMutationReader = MutationReader<DataviewMutationModel>
export type DataviewMutationDelta = MutationDeltaOf<DataviewMutationModel>

const TITLE_FIELD: Extract<Field, { kind: 'title' }> = {
  id: TITLE_FIELD_ID,
  name: 'Title',
  kind: 'title',
  system: true
}

export const dataviewTitleField = TITLE_FIELD
