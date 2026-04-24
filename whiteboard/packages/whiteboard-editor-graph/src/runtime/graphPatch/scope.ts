import { keySet, type KeySet } from '@shared/core'
import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type { GraphPatchScope } from '../../contracts/delta'

type ScopeKeys<TId extends string> =
  | Iterable<TId>
  | KeySet<TId>

const EMPTY_SCOPE_KEYS = new Set<never>()

const cloneScopeKeys = <TId extends string>(
  keys?: ScopeKeys<TId>
): KeySet<TId> => {
  if (!keys) {
    return keySet.none<TId>()
  }

  if (
    typeof keys === 'object'
    && keys !== null
    && 'kind' in keys
  ) {
    return keySet.clone(keys as KeySet<TId>)
  }

  return keySet.some(keys as Iterable<TId>)
}

export const createGraphPatchScope = (
  input: Partial<{
    reset: boolean
    order: boolean
    nodes: ScopeKeys<NodeId>
    edges: ScopeKeys<EdgeId>
    mindmaps: ScopeKeys<MindmapId>
    groups: ScopeKeys<GroupId>
  }> = {}
): GraphPatchScope => ({
  reset: input.reset ?? false,
  order: input.order ?? false,
  nodes: cloneScopeKeys(input.nodes),
  edges: cloneScopeKeys(input.edges),
  mindmaps: cloneScopeKeys(input.mindmaps),
  groups: cloneScopeKeys(input.groups)
})

export const normalizeGraphPatchScope = (
  scope: GraphPatchScope | undefined
): GraphPatchScope => createGraphPatchScope(scope)

export const mergeGraphPatchScope = (
  current: GraphPatchScope | undefined,
  next: GraphPatchScope
): GraphPatchScope => createGraphPatchScope({
  reset: (current?.reset ?? false) || next.reset,
  order: (current?.order ?? false) || next.order,
  nodes: keySet.union(current?.nodes ?? keySet.none<NodeId>(), next.nodes),
  edges: keySet.union(current?.edges ?? keySet.none<EdgeId>(), next.edges),
  mindmaps: keySet.union(current?.mindmaps ?? keySet.none<MindmapId>(), next.mindmaps),
  groups: keySet.union(current?.groups ?? keySet.none<GroupId>(), next.groups)
})

export const hasGraphPatchScope = (
  scope: GraphPatchScope | undefined
): boolean => {
  if (!scope) {
    return false
  }

  return (
    scope.reset
    || scope.order
    || !keySet.isEmpty(scope.nodes)
    || !keySet.isEmpty(scope.edges)
    || !keySet.isEmpty(scope.mindmaps)
    || !keySet.isEmpty(scope.groups)
  )
}

export const readGraphPatchScopeKeys = <TId extends string>(
  keys: KeySet<TId>
): ReadonlySet<TId> => {
  if (keys.kind === 'none') {
    return EMPTY_SCOPE_KEYS as ReadonlySet<TId>
  }
  if (keys.kind === 'all') {
    throw new Error('GraphPatchScope key sets must not be all; use reset instead.')
  }
  return keys.keys
}
