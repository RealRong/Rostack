import {
  change
} from '@shared/delta'

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

export const documentChange = change(documentChangeSpec)
export const activeChange = change(activeChangeSpec)

export type DocumentDelta = ReturnType<typeof documentChange.create>
export type DocDelta = DocumentDelta
export type ActiveDelta = ReturnType<typeof activeChange.create>

export interface DataviewDelta {
  doc?: DocDelta
  active?: ActiveDelta
}

export type EngineDelta = DataviewDelta
