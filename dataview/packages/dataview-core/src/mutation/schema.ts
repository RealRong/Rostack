import type {
  CustomField,
  CustomFieldId,
  DataDoc,
  DataRecord,
  FieldOption,
  FieldOptionId,
  RecordId,
  StatusCategory,
  View,
  ViewCalc,
  ViewGroup,
  ViewId,
  ViewLayoutOptions,
  ViewType,
} from '@dataview/core/types'
import {
  dictionary,
  field,
  schema,
  sequence,
  table,
  type MutationChange,
  type MutationReader,
  type MutationWriter,
} from '@shared/mutation'

const fieldOptionShape = {
  id: field<FieldOption['id']>(),
  name: field<FieldOption['name']>(),
  color: field<FieldOption['color']>(),
  category: field<StatusCategory | undefined>(),
} as const

const fieldOptions = table<FieldOptionId, typeof fieldOptionShape>(fieldOptionShape)

const recordShape = {
  id: field<DataRecord['id']>(),
  title: field<DataRecord['title']>(),
  type: field<DataRecord['type']>(),
  values: dictionary<CustomFieldId, unknown>(),
  meta: field<DataRecord['meta']>(),
} as const

const records = table<RecordId, typeof recordShape>(recordShape)

const fieldShape = {
  id: field<CustomField['id']>(),
  name: field<CustomField['name']>(),
  kind: field<CustomField['kind']>(),
  displayFullUrl: field<CustomField['displayFullUrl']>(),
  format: field<CustomField['format']>(),
  precision: field<CustomField['precision']>(),
  currency: field<CustomField['currency']>(),
  useThousandsSeparator: field<CustomField['useThousandsSeparator']>(),
  defaultOptionId: field<CustomField['defaultOptionId']>(),
  displayDateFormat: field<CustomField['displayDateFormat']>(),
  displayTimeFormat: field<CustomField['displayTimeFormat']>(),
  defaultValueKind: field<CustomField['defaultValueKind']>(),
  defaultTimezone: field<CustomField['defaultTimezone']>(),
  multiple: field<CustomField['multiple']>(),
  accept: field<CustomField['accept']>(),
  meta: field<CustomField['meta']>(),
  options: fieldOptions,
} as const

const fields = table<CustomFieldId, typeof fieldShape>(fieldShape)

const viewShape = {
  id: field<View['id']>(),
  name: field<View['name']>(),
  type: field<ViewType>(),
  search: field<View['search']>(),
  filter: field<View['filter']>(),
  sort: field<View['sort']>(),
  group: field<ViewGroup | undefined>(),
  calc: field<ViewCalc>(),
  options: field<ViewLayoutOptions>(),
  fields: sequence<View['fields'][number]>(),
  order: sequence<RecordId>(),
} as const

const views = table<ViewId, typeof viewShape>(viewShape)

export const dataviewMutationSchema = schema({
  activeViewId: field<DataDoc['activeViewId']>(),
  meta: field<DataDoc['meta']>(),
  records,
  fields,
  views,
})

export type DataviewMutationSchema = typeof dataviewMutationSchema
export type DataviewMutationWriter = MutationWriter<DataviewMutationSchema>
export type DataviewMutationReader = MutationReader<DataviewMutationSchema>
export type DataviewBaseMutationChange = MutationChange<DataviewMutationSchema>
