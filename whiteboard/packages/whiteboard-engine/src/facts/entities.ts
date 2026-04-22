import type {
  Document,
  Edge,
  EdgeId,
  Group,
  GroupId,
  MindmapId,
  MindmapRecord,
  Node,
  NodeId
} from '@whiteboard/core/types'
import type {
  Entities,
  Owners
} from '../contracts/document'

const toNodeMap = (
  document: Document
): ReadonlyMap<NodeId, Node> => new Map(
  Object.entries(document.nodes) as readonly (readonly [NodeId, Node])[]
)

const toEdgeMap = (
  document: Document
): ReadonlyMap<EdgeId, Edge> => new Map(
  Object.entries(document.edges) as readonly (readonly [EdgeId, Edge])[]
)

const toMindmapMap = (
  document: Document
): ReadonlyMap<MindmapId, MindmapRecord> => new Map(
  Object.entries(document.mindmaps) as readonly (readonly [MindmapId, MindmapRecord])[]
)

const toGroupMap = (
  document: Document
): ReadonlyMap<GroupId, Group> => new Map(
  Object.entries(document.groups) as readonly (readonly [GroupId, Group])[]
)

export const buildOwners = (
  document: Document
): Owners => ({
  mindmaps: toMindmapMap(document),
  groups: toGroupMap(document)
})

export const buildEntities = (
  document: Document
): Entities => ({
  nodes: toNodeMap(document),
  edges: toEdgeMap(document),
  owners: buildOwners(document)
})
