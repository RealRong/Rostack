import {
  field,
  map,
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
  EdgeGuidePreview,
  EdgePreview,
  MindmapPreviewEntry,
  NodePreview,
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
  EditorHoverState,
  EditorStableInteractionState,
  EditorStateDocument,
} from './document'

type PreviewNodeValue = NodePreview & {
  id: NodeId
}

type PreviewEdgeValue = EdgePreview & {
  id: EdgeId
}

type PreviewMindmapValue = MindmapPreviewEntry & {
  id: MindmapId
}

type PreviewMapValue<TId extends string, TValue> = Readonly<
  Partial<Record<TId, TValue & {
    id: TId
  }>>
>

type PreviewRecord<TId extends string, TValue> = Readonly<
  Partial<Record<TId, TValue>>
>

type PreviewDrawValue = {
  current: PreviewInput['draw']
}

type PreviewEdgeGuideValue = {
  current?: EdgeGuidePreview
}

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
  patch: field<NodePreview['patch']>().optional(),
  presentation: field<NodePreview['presentation']>().optional(),
  hovered: field<boolean>(),
  hidden: field<boolean>(),
} as const

const previewEdgeShape = {
  patch: field<EdgePreview['patch']>().optional(),
  activeRouteIndex: field<number>().optional(),
} as const

const previewMindmapShape = {
  rootMove: field<MindmapPreviewEntry['rootMove']>().optional(),
  subtreeMove: field<MindmapPreviewEntry['subtreeMove']>().optional(),
} as const

const selectionPreviewShape = {
  marquee: field<PreviewInput['selection']['marquee']>().optional(),
  guides: field<PreviewInput['selection']['guides']>(),
} as const

const toPreviewMapValue = <TId extends string, TValue extends object>(
  source: PreviewRecord<TId, TValue>
): PreviewMapValue<TId, TValue> => Object.fromEntries(
  Object.entries(source).flatMap(([id, value]) => value === undefined
    ? []
    : [[id, {
        id: id as TId,
        ...value
      }]]
  )
) as PreviewMapValue<TId, TValue>

const fromPreviewMapValue = <TId extends string, TValue extends {
  id: TId
} & object>(
  source: PreviewMapValue<TId, TValue>
): PreviewRecord<TId, Omit<TValue, 'id'>> => Object.fromEntries(
  Object.entries(source).flatMap(([id, value]) => value === undefined
    ? []
    : [[id, Object.fromEntries(
        Object.entries(value as Record<string, unknown>).filter(([key]) => key !== 'id')
      )]]
  )
) as PreviewRecord<TId, Omit<TValue, 'id'>>

export const editorStateMutationSchema = schema({
  state: singleton(stateShape).from({
    read: (document: EditorStateDocument) => document.state,
    write: (document: EditorStateDocument, next) => ({
      ...document,
      state: next,
    }),
  }),
  hover: singleton(hoverShape).from({
    read: (document: EditorStateDocument) => document.hover,
    write: (document: EditorStateDocument, next) => ({
      ...document,
      hover: next as EditorHoverState,
    }),
  }),
  preview: {
    node: map<NodeId, typeof previewNodeShape>(previewNodeShape).from({
      read: (document: EditorStateDocument) => (
        toPreviewMapValue<NodeId, NodePreview>(document.preview.node)
      ),
      write: (document: EditorStateDocument, next) => ({
        ...document,
        preview: {
          ...document.preview,
          node: fromPreviewMapValue<NodeId, PreviewNodeValue>(
            next as PreviewMapValue<NodeId, PreviewNodeValue>
          ) as PreviewInput['node'],
        },
      }),
    }),
    edge: map<EdgeId, typeof previewEdgeShape>(previewEdgeShape).from({
      read: (document: EditorStateDocument) => (
        toPreviewMapValue<EdgeId, EdgePreview>(document.preview.edge)
      ),
      write: (document: EditorStateDocument, next) => ({
        ...document,
        preview: {
          ...document.preview,
          edge: fromPreviewMapValue<EdgeId, PreviewEdgeValue>(
            next as PreviewMapValue<EdgeId, PreviewEdgeValue>
          ) as PreviewInput['edge'],
        },
      }),
    }),
    mindmap: map<MindmapId, typeof previewMindmapShape>(previewMindmapShape).from({
      read: (document: EditorStateDocument) => (
        toPreviewMapValue<MindmapId, MindmapPreviewEntry>(document.preview.mindmap)
      ),
      write: (document: EditorStateDocument, next) => ({
        ...document,
        preview: {
          ...document.preview,
          mindmap: fromPreviewMapValue<MindmapId, PreviewMindmapValue>(
            next as PreviewMapValue<MindmapId, PreviewMindmapValue>
          ) as PreviewInput['mindmap'],
        },
      }),
    }),
    selection: singleton(selectionPreviewShape).from({
      read: (document: EditorStateDocument) => document.preview.selection,
      write: (document: EditorStateDocument, next) => ({
        ...document,
        preview: {
          ...document.preview,
          selection: next as PreviewInput['selection'],
        },
      }),
    }),
    draw: singleton({
      current: field<PreviewInput['draw']>(),
    }).from({
      read: (document: EditorStateDocument) => ({
        current: document.preview.draw,
      }),
      write: (document: EditorStateDocument, next) => ({
        ...document,
        preview: {
          ...document.preview,
          draw: (next as PreviewDrawValue).current,
        },
      }),
    }),
    edgeGuide: singleton({
      current: field<EdgeGuidePreview>().optional(),
    }).from({
      read: (document: EditorStateDocument) => ({
        current: document.preview.edgeGuide,
      }),
      write: (document: EditorStateDocument, next) => ({
        ...document,
        preview: {
          ...document.preview,
          edgeGuide: (next as PreviewEdgeGuideValue).current,
        },
      }),
    }),
  },
})
