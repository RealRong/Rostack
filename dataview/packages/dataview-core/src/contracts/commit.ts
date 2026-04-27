import type {
  CustomFieldId,
  FieldId,
  RecordId,
  ViewId
} from '@dataview/core/types/state'

export type ViewQueryAspect =
  | 'search'
  | 'filter'
  | 'sort'
  | 'group'
  | 'order'

export type ViewLayoutAspect =
  | 'name'
  | 'type'
  | 'display'
  | 'options'

export type FieldSchemaAspect =
  | 'name'
  | 'kind'
  | 'options'
  | 'config'
  | 'meta'
  | 'all'

export type RecordPatchAspect =
  | 'title'
  | 'type'
  | 'meta'

export interface CommitImpactViewChange {
  queryAspects?: Set<ViewQueryAspect>
  layoutAspects?: Set<ViewLayoutAspect>
  calculationFields?: Set<FieldId> | 'all'
}

export interface CommitImpact {
  reset?: true
  records?: {
    inserted?: Set<RecordId>
    removed?: Set<RecordId>
    patched?: Map<RecordId, Set<RecordPatchAspect>>
    touched?: Set<RecordId> | 'all'
    recordSetChanged?: boolean
  }
  values?: {
    touched?: Map<RecordId, Set<FieldId>> | 'all'
  }
  fields?: {
    inserted?: Set<CustomFieldId>
    removed?: Set<CustomFieldId>
    schema?: Map<FieldId, Set<FieldSchemaAspect>>
    schemaTouched?: Set<FieldId>
    touched?: Set<FieldId> | 'all'
  }
  views?: {
    inserted?: Set<ViewId>
    removed?: Set<ViewId>
    changed?: Map<ViewId, CommitImpactViewChange>
    touched?: Set<ViewId> | 'all'
  }
  activeView?: {
    before?: ViewId
    after?: ViewId
  }
  external?: {
    versionBumped?: boolean
    source?: string
  }
}

export interface CommitSummary {
  records: boolean
  fields: boolean
  views: boolean
  activeView: boolean
  external: boolean
}
