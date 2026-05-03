import {
  field,
  map,
  optional,
  schema,
  singleton,
} from '@shared/mutation'
import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId,
} from '@whiteboard/core/types'
import type {
  PreviewInput,
} from '@whiteboard/editor-scene'
import type {
  DrawState,
} from '@whiteboard/editor/schema/draw-state'
import type {
  EditSession,
} from '@whiteboard/editor/schema/edit'
import type {
  Tool,
} from '@whiteboard/editor/schema/tool'
import type {
  EditorStableInteractionState,
  EditorStateDocument,
} from './document'

const stateShape = {
  tool: field<Tool>(),
  draw: field<DrawState>(),
  selection: field<EditorStateDocument['state']['selection']>(),
  edit: field<EditSession>(),
  interaction: field<EditorStableInteractionState>(),
} as const

const hoverShape = {
  node: field<NodeId | null>(),
  edge: field<EdgeId | null>(),
  mindmap: field<MindmapId | null>(),
  group: field<GroupId | null>(),
  selectionBox: field<boolean>(),
} as const

const previewNodeShape = {
  patch: optional(field<NonNullable<EditorStateDocument['preview']['node'][NodeId]>['patch']>()),
  presentation: optional(field<NonNullable<EditorStateDocument['preview']['node'][NodeId]>['presentation']>()),
  hovered: field<boolean>(),
  hidden: field<boolean>(),
} as const

const previewEdgeShape = {
  patch: optional(field<NonNullable<EditorStateDocument['preview']['edge'][EdgeId]>['patch']>()),
  activeRouteIndex: optional(field<number>()),
} as const

const previewMindmapShape = {
  rootMove: optional(field<NonNullable<EditorStateDocument['preview']['mindmap'][MindmapId]>['rootMove']>()),
  subtreeMove: optional(field<NonNullable<EditorStateDocument['preview']['mindmap'][MindmapId]>['subtreeMove']>()),
} as const

const selectionPreviewShape = {
  marquee: optional(field<PreviewInput['selection']['marquee']>()),
  guides: field<PreviewInput['selection']['guides']>(),
} as const

export const editorStateMutationSchema = schema({
  state: singleton(stateShape),
  hover: singleton(hoverShape),
  preview: {
    node: map<NodeId, typeof previewNodeShape>(previewNodeShape),
    edge: map<EdgeId, typeof previewEdgeShape>(previewEdgeShape),
    mindmap: map<MindmapId, typeof previewMindmapShape>(previewMindmapShape),
    selection: singleton(selectionPreviewShape),
    draw: field<PreviewInput['draw']>(),
    edgeGuide: optional(field<PreviewInput['edgeGuide']>()),
  },
})
