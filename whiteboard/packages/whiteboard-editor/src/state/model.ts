import {
  field,
  map,
  optional,
  schema,
  singleton,
} from '@shared/mutation'
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
  node: field<string | null>(),
  edge: field<string | null>(),
  mindmap: field<string | null>(),
  group: field<string | null>(),
  selectionBox: field<boolean>(),
} as const

const previewNodeShape = {
  patch: optional(field<NonNullable<EditorStateDocument['preview']['node'][string]>['patch']>()),
  presentation: optional(field<NonNullable<EditorStateDocument['preview']['node'][string]>['presentation']>()),
  hovered: field<boolean>(),
  hidden: field<boolean>(),
} as const

const previewEdgeShape = {
  patch: optional(field<NonNullable<EditorStateDocument['preview']['edge'][string]>['patch']>()),
  activeRouteIndex: optional(field<number>()),
} as const

const previewMindmapShape = {
  rootMove: optional(field<NonNullable<EditorStateDocument['preview']['mindmap'][string]>['rootMove']>()),
  subtreeMove: optional(field<NonNullable<EditorStateDocument['preview']['mindmap'][string]>['subtreeMove']>()),
} as const

const selectionPreviewShape = {
  marquee: optional(field<PreviewInput['selection']['marquee']>()),
  guides: field<PreviewInput['selection']['guides']>(),
} as const

export const editorStateMutationSchema = schema({
  state: singleton(stateShape),
  hover: singleton(hoverShape),
  preview: {
    node: map<string, typeof previewNodeShape>(previewNodeShape),
    edge: map<string, typeof previewEdgeShape>(previewEdgeShape),
    mindmap: map<string, typeof previewMindmapShape>(previewMindmapShape),
    selection: singleton(selectionPreviewShape),
    draw: field<PreviewInput['draw']>(),
    edgeGuide: optional(field<PreviewInput['edgeGuide']>()),
  },
})
