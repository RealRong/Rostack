import type {
  IdDelta as SharedIdDelta
} from '@shared/delta'
import { idDelta } from '@shared/delta'
import type { Revision } from '@shared/projection'
import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type {
  SpatialKey
} from '../model/spatial/contracts'

export type IdDelta<TId extends string> = SharedIdDelta<TId>

export interface GraphDelta {
  revision: Revision
  order: boolean
  entities: {
    nodes: IdDelta<NodeId>
    edges: IdDelta<EdgeId>
    mindmaps: IdDelta<MindmapId>
    groups: IdDelta<GroupId>
  }
  geometry: {
    nodes: Set<NodeId>
    edges: Set<EdgeId>
    mindmaps: Set<MindmapId>
    groups: Set<GroupId>
  }
}

export interface SpatialDelta {
  revision: Revision
  order: boolean
  records: IdDelta<SpatialKey>
}

export interface SpatialPatchScope {
  reset: boolean
  graph: boolean
}

export interface GraphPatchScope {
  reset: boolean
  order: boolean
  nodes: ReadonlySet<NodeId>
  edges: ReadonlySet<EdgeId>
  mindmaps: ReadonlySet<MindmapId>
  groups: ReadonlySet<GroupId>
}

export interface ViewPatchScope {
  reset: boolean
  chrome: boolean
  items: boolean
  nodes: ReadonlySet<NodeId>
  edges: ReadonlySet<EdgeId>
  statics: ReadonlySet<EdgeId>
  labels: ReadonlySet<EdgeId>
  active: ReadonlySet<EdgeId>
  masks: ReadonlySet<EdgeId>
  overlay: boolean
}

type ScopeFlagField = {
  kind: 'flag'
}

type ScopeSetField<TValue> = {
  kind: 'set'
  __value?: TValue
}

type ScopeField =
  | ScopeFlagField
  | ScopeSetField<unknown>

type ScopeSchema<TFields extends Record<string, ScopeField>> = {
  kind: 'scope'
  fields: TFields
}

type ScopeFieldInputValue<TField extends ScopeField> =
  TField extends ScopeFlagField
    ? boolean
    : TField extends ScopeSetField<infer TValue>
      ? Iterable<TValue> | ReadonlySet<TValue>
      : never

type ScopeFieldValue<TField extends ScopeField> =
  TField extends ScopeFlagField
    ? boolean
    : TField extends ScopeSetField<infer TValue>
      ? ReadonlySet<TValue>
      : never

export type ScopeInputValue<TSchema> = TSchema extends ScopeSchema<infer TFields>
  ? Partial<{
      [K in keyof TFields]: ScopeFieldInputValue<TFields[K]>
    }>
  : undefined

export type ScopeValue<TSchema> = TSchema extends ScopeSchema<infer TFields>
  ? {
      [K in keyof TFields]: ScopeFieldValue<TFields[K]>
    }
  : undefined

const FLAG_SCOPE_FIELD = {
  kind: 'flag'
} as const satisfies ScopeFlagField

const SET_SCOPE_FIELD = {
  kind: 'set'
} as const satisfies ScopeSetField<never>

const scopeFlag = (): ScopeFlagField => FLAG_SCOPE_FIELD

const scopeSet = <TValue,>(): ScopeSetField<TValue> => (
  SET_SCOPE_FIELD as ScopeSetField<TValue>
)

const createScope = <TFields extends Record<string, ScopeField>>(
  fields: TFields
): ScopeSchema<TFields> => ({
  kind: 'scope',
  fields
})

export const graphPhaseScope = createScope({
  reset: scopeFlag(),
  order: scopeFlag(),
  nodes: scopeSet<NodeId>(),
  edges: scopeSet<EdgeId>(),
  mindmaps: scopeSet<MindmapId>(),
  groups: scopeSet<GroupId>()
})

export const spatialPhaseScope = createScope({
  reset: scopeFlag(),
  graph: scopeFlag()
})

export const viewPhaseScope = createScope({
  reset: scopeFlag(),
  chrome: scopeFlag(),
  items: scopeFlag(),
  nodes: scopeSet<NodeId>(),
  edges: scopeSet<EdgeId>(),
  statics: scopeSet<EdgeId>(),
  labels: scopeSet<EdgeId>(),
  active: scopeSet<EdgeId>(),
  masks: scopeSet<EdgeId>(),
  overlay: scopeFlag()
})

export interface EditorPhaseScopeMap {
  graph: typeof graphPhaseScope
  spatial: typeof spatialPhaseScope
  view: typeof viewPhaseScope
}

export const createGraphDelta = (): GraphDelta => ({
  revision: 0,
  order: false,
  entities: {
    nodes: idDelta.create<NodeId>(),
    edges: idDelta.create<EdgeId>(),
    mindmaps: idDelta.create<MindmapId>(),
    groups: idDelta.create<GroupId>()
  },
  geometry: {
    nodes: new Set(),
    edges: new Set(),
    mindmaps: new Set(),
    groups: new Set()
  }
})

export const resetGraphDelta = (
  delta: GraphDelta
) => {
  delta.revision = 0
  delta.order = false
  idDelta.reset(delta.entities.nodes)
  idDelta.reset(delta.entities.edges)
  idDelta.reset(delta.entities.mindmaps)
  idDelta.reset(delta.entities.groups)
  delta.geometry.nodes.clear()
  delta.geometry.edges.clear()
  delta.geometry.mindmaps.clear()
  delta.geometry.groups.clear()
}
