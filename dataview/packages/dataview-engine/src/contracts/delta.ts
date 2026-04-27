import {
  change
} from '@shared/delta'
import type {
  CustomFieldId,
  FieldId,
  RecordId,
  ValueRef,
  ViewId
} from '@dataview/core/types'
import type {
  ItemId,
  SectionId
} from './shared'

export const documentChangeSpec = {
  reset: 'flag',
  meta: 'flag',
  records: 'ids',
  values: 'ids',
  fields: 'ids',
  schemaFields: 'ids',
  views: 'ids'
} as const

export const activeChangeSpec = {
  reset: 'flag',
  view: 'flag',
  query: 'flag',
  table: 'flag',
  gallery: 'flag',
  kanban: 'flag',
  records: {
    matched: 'flag',
    ordered: 'flag',
    visible: 'flag'
  },
  fields: 'ids',
  sections: 'ids',
  items: 'ids',
  summaries: 'ids'
} as const

export const documentChange = change<typeof documentChangeSpec, {
  ids: {
    records: RecordId
    values: ValueRef
    fields: FieldId
    schemaFields: CustomFieldId
    views: ViewId
  }
}>(documentChangeSpec)
export const activeChange = change<typeof activeChangeSpec, {
  ids: {
    fields: FieldId
    sections: SectionId
    items: ItemId
    summaries: SectionId
  }
}>(activeChangeSpec)

export type DocumentDelta = ReturnType<typeof documentChange.create>
export type DocDelta = DocumentDelta
export type ActiveDelta = ReturnType<typeof activeChange.create>

export interface DataviewDelta {
  doc?: DocDelta
  active?: ActiveDelta
}

export type EngineDelta = DataviewDelta
