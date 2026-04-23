import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type { GraphPatchScope } from '../../contracts/delta'

export interface MutableGraphPatchScope {
  reset: boolean
  order: boolean
  nodes: Set<NodeId>
  edges: Set<EdgeId>
  mindmaps: Set<MindmapId>
  groups: Set<GroupId>
}

export const createGraphPatchScope = (
  input: Partial<{
    reset: boolean
    order: boolean
    nodes: Iterable<NodeId>
    edges: Iterable<EdgeId>
    mindmaps: Iterable<MindmapId>
    groups: Iterable<GroupId>
  }> = {}
): MutableGraphPatchScope => ({
  reset: input.reset ?? false,
  order: input.order ?? false,
  nodes: new Set(input.nodes ?? []),
  edges: new Set(input.edges ?? []),
  mindmaps: new Set(input.mindmaps ?? []),
  groups: new Set(input.groups ?? [])
})

export const normalizeGraphPatchScope = (
  scope: GraphPatchScope | undefined
): MutableGraphPatchScope => createGraphPatchScope(scope)

export const mergeGraphPatchScope = (
  current: GraphPatchScope | undefined,
  next: GraphPatchScope
): MutableGraphPatchScope => createGraphPatchScope({
  reset: (current?.reset ?? false) || next.reset,
  order: (current?.order ?? false) || next.order,
  nodes: [
    ...(current?.nodes ?? []),
    ...next.nodes
  ],
  edges: [
    ...(current?.edges ?? []),
    ...next.edges
  ],
  mindmaps: [
    ...(current?.mindmaps ?? []),
    ...next.mindmaps
  ],
  groups: [
    ...(current?.groups ?? []),
    ...next.groups
  ]
})

export const hasGraphPatchScope = (
  scope: GraphPatchScope | undefined
): boolean => Boolean(
  scope?.reset
  || scope?.order
  || scope?.nodes.size
  || scope?.edges.size
  || scope?.mindmaps.size
  || scope?.groups.size
)
