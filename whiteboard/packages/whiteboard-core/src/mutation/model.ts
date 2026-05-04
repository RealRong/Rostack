import {
  field,
  map,
  optional,
  schema,
  sequence,
  tree,
  type MutationChange,
  type MutationQuery,
  type MutationReader,
  type MutationWriter,
} from '@shared/mutation'
import type {
  MindmapId,
  MindmapLayoutSpec,
  MindmapNodeId,
} from '@whiteboard/core/mindmap/types'
import type {
  Background,
  CanvasItemRef,
  Document,
  Edge,
  Group,
  Node,
} from '@whiteboard/core/types'
import {
  canvasRefKey,
  type WhiteboardMindmapTreeValue,
} from './support'

const nodeShape = {
  id: field<Node['id']>(),
  type: field<Node['type']>(),
  position: field<Node['position']>(),
  size: field<Node['size']>(),
  rotation: optional(field<number>()),
  groupId: optional(field<Group['id']>()),
  owner: optional(field<Node['owner']>()),
  locked: optional(field<boolean>()),
  data: optional(field<Node['data']>()),
  style: optional(field<Node['style']>()),
} as const

const edgeShape = {
  id: field<Edge['id']>(),
  source: field<Edge['source']>(),
  target: field<Edge['target']>(),
  type: field<Edge['type']>(),
  locked: optional(field<boolean>()),
  groupId: optional(field<Group['id']>()),
  textMode: optional(field<Edge['textMode']>()),
  style: optional(field<Edge['style']>()),
  data: optional(field<Edge['data']>()),
  labels: optional(field<Edge['labels']>()),
  points: optional(field<Edge['points']>()),
} as const

const groupShape = {
  id: field<Group['id']>(),
  locked: optional(field<boolean>()),
  name: optional(field<string>()),
} as const

const mindmapShape = {
  id: field<MindmapId>(),
  layout: field<MindmapLayoutSpec>(),
  tree: tree<MindmapNodeId, WhiteboardMindmapTreeValue>(),
} as const

export const whiteboardMutationSchema = schema({
  id: field<Document['id']>(),
  name: optional(field<string>()),
  background: optional(field<Background>()),
  order: sequence<CanvasItemRef>({
    keyOf: canvasRefKey
  }),
  nodes: map<Node['id'], typeof nodeShape>(nodeShape),
  edges: map<Edge['id'], typeof edgeShape>(edgeShape),
  groups: map<Group['id'], typeof groupShape>(groupShape),
  mindmaps: map<MindmapId, typeof mindmapShape>(mindmapShape),
})

export type WhiteboardMutationSchema = typeof whiteboardMutationSchema
export type WhiteboardMutationReader = MutationReader<WhiteboardMutationSchema>
export type WhiteboardMutationWriter = MutationWriter<WhiteboardMutationSchema>
export type WhiteboardMutationQuery = MutationQuery<WhiteboardMutationSchema>
export type WhiteboardMutationChange = MutationChange<WhiteboardMutationSchema>
