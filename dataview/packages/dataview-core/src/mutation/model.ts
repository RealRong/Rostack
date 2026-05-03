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
  dictionary,
  field,
  sequence,
  object,
  schema,
  table,
  type MutationDeltaOf,
  type MutationReader,
  type MutationWriter,
} from '@shared/mutation'

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

export const dataviewMutationSchema = schema<DataDoc>()({
  schemaVersion: field<DataDoc['schemaVersion']>(),
  activeViewId: field<DataDoc['activeViewId']>(),
  meta: object<NonNullable<DataDoc['meta']>>(),
  record: table<DataDoc, RecordId, DataRecord>()({
    title: field<DataRecord['title']>(),
    type: field<DataRecord['type']>(),
    values: dictionary<CustomFieldId, unknown>(),
    meta: object<NonNullable<DataRecord['meta']>>(),
  }).from({
    path: 'records'
  }).changes(({ field, dictionary, object }) => ({
    title: [field('title')],
    type: [field('type')],
    values: [dictionary('values').deep()],
    meta: [object('meta').deep()]
  })),
  field: table<DataDoc, CustomFieldId, CustomField>()({
    name: field<CustomField['name']>(),
    kind: field<CustomField['kind']>(),
    system: field<boolean>(),
    displayFullUrl: field<boolean>(),
    format: field<Extract<CustomField, { kind: 'number' }>['format']>(),
    precision: field<Extract<CustomField, { kind: 'number' }>['precision']>(),
    currency: field<Extract<CustomField, { kind: 'number' }>['currency']>(),
    useThousandsSeparator: field<Extract<CustomField, { kind: 'number' }>['useThousandsSeparator']>(),
    defaultOptionId: field<Extract<CustomField, { kind: 'status' }>['defaultOptionId']>(),
    displayDateFormat: field<Extract<CustomField, { kind: 'date' }>['displayDateFormat']>(),
    displayTimeFormat: field<Extract<CustomField, { kind: 'date' }>['displayTimeFormat']>(),
    defaultValueKind: field<Extract<CustomField, { kind: 'date' }>['defaultValueKind']>(),
    defaultTimezone: field<Extract<CustomField, { kind: 'date' }>['defaultTimezone']>(),
    multiple: field<Extract<CustomField, { kind: 'asset' }>['multiple']>(),
    accept: field<Extract<CustomField, { kind: 'asset' }>['accept']>(),
    meta: object<NonNullable<CustomField['meta']>>(),
    options: sequence<FieldOption>().using({
      read: (document, fieldId) => readFieldOptions(document as DataDoc, fieldId as CustomFieldId),
      write: (document, fieldId, options) => writeFieldOptions(document as DataDoc, fieldId as CustomFieldId, options),
      identify: (option) => option.id,
      emit: 'options'
    })
  }).from({
    path: 'fields'
  }).changes(({ field, object }) => ({
    name: [field('name')],
    kind: [field('kind')],
    system: [field('system')],
    displayFullUrl: [field('displayFullUrl')],
    format: [field('format')],
    precision: [field('precision')],
    currency: [field('currency')],
    useThousandsSeparator: [field('useThousandsSeparator')],
    defaultOptionId: [field('defaultOptionId')],
    displayDateFormat: [field('displayDateFormat')],
    displayTimeFormat: [field('displayTimeFormat')],
    defaultValueKind: [field('defaultValueKind')],
    defaultTimezone: [field('defaultTimezone')],
    multiple: [field('multiple')],
    accept: [field('accept')],
    meta: [object('meta').deep()]
  })),
  view: table<DataDoc, ViewId, View>()({
    name: field<View['name']>(),
    type: field<View['type']>(),
    search: field<View['search']>(),
    filter: field<View['filter']>(),
    sort: field<View['sort']>(),
    group: field<View['group']>(),
    calc: field<View['calc']>(),
    options: field<View['options']>(),
    fields: sequence<FieldId>().using({
      read: (document, viewId) => readViewFields(document as DataDoc, viewId as ViewId),
      write: (document, viewId, fieldIds) => writeViewFields(document as DataDoc, viewId as ViewId, fieldIds),
      identify: (fieldId) => fieldId,
      emit: 'fields'
    }),
    order: sequence<RecordId>().using({
      read: (document, viewId) => readViewOrder(document as DataDoc, viewId as ViewId),
      write: (document, viewId, order) => writeViewOrder(document as DataDoc, viewId as ViewId, order),
      identify: (recordId) => recordId,
      emit: 'order'
    })
  }).from({
    path: 'views'
  }).changes(({ field }) => ({
    name: [field('name')],
    type: [field('type')],
    search: [field('search')],
    filter: [field('filter')],
    sort: [field('sort')],
    group: [field('group')],
    calc: [field('calc')],
    options: [field('options')]
  }))
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
