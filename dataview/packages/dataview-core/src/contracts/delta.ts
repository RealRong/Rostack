import type {
  CustomFieldId,
  FieldId,
  RecordId,
  ViewId
} from '@dataview/core/contracts/state'

export type DeltaIds<T extends string = string> = readonly T[] | 'all'

export interface DeltaEntityIds<T extends string = string> {
  add?: readonly T[]
  update?: DeltaIds<T>
  remove?: readonly T[]
}

export interface DeltaValueIds {
  records?: DeltaIds<RecordId>
  fields?: DeltaIds<FieldId>
}

export interface DeltaEntities {
  records?: DeltaEntityIds<RecordId>
  fields?: DeltaEntityIds<CustomFieldId>
  views?: DeltaEntityIds<ViewId>
  values?: DeltaValueIds
}

export interface DeltaSummary {
  records: boolean
  fields: boolean
  views: boolean
  values: boolean
  activeView: boolean
  indexes: boolean
}

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

export type DeltaItem =
  | {
      kind: 'activeView.set'
      before?: ViewId
      after?: ViewId
    }
  | {
      kind: 'view.query'
      viewId: ViewId
      aspects: readonly ViewQueryAspect[]
    }
  | {
      kind: 'view.layout'
      viewId: ViewId
      aspects: readonly ViewLayoutAspect[]
    }
  | {
      kind: 'view.calculations'
      viewId: ViewId
      fields?: readonly FieldId[] | 'all'
    }
  | {
      kind: 'field.schema'
      fieldId: FieldId
      aspects: readonly FieldSchemaAspect[]
    }
  | {
      kind: 'record.add'
      ids: readonly RecordId[]
    }
  | {
      kind: 'record.remove'
      ids: readonly RecordId[]
    }
  | {
      kind: 'record.patch'
      ids: readonly RecordId[]
      aspects: readonly RecordPatchAspect[]
    }
  | {
      kind: 'record.values'
      records: readonly RecordId[] | 'all'
      fields: readonly FieldId[] | 'all'
    }

export interface CommitDelta {
  summary: DeltaSummary
  entities: DeltaEntities
  semantics: readonly DeltaItem[]
}
