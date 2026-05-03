import {
  field,
  map,
  object,
  schema,
  singleton,
} from '@shared/mutation'
import type {
  SelectionTarget
} from '@whiteboard/core/selection'
import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type {
  EdgeGuidePreview,
  EdgePreview,
  MindmapPreviewEntry,
  NodePreview,
  PreviewInput
} from '@whiteboard/editor-scene'
import type {
  DrawState
} from '@whiteboard/editor/schema/draw-state'
import type {
  EditSession
} from '@whiteboard/editor/schema/edit'
import type {
  Tool
} from '@whiteboard/editor/schema/tool'
import type {
  EditorHoverState,
  EditorStableInteractionState,
  EditorStateDocument
} from './document'

type PreviewDrawValue = {
  current: PreviewInput['draw']
}

type PreviewEdgeGuideValue = {
  current: EdgeGuidePreview | undefined
}

type PreviewNodeEntry = NodePreview & {
  id: NodeId
}

type PreviewEdgeEntry = EdgePreview & {
  id: EdgeId
}

type PreviewMindmapRecordEntry = MindmapPreviewEntry & {
  id: MindmapId
}

export const editorStateMutationSchema = schema<EditorStateDocument>()({
  state: singleton<EditorStateDocument, EditorStateDocument['state']>()({
    tool: object<Tool>(),
    draw: object<DrawState>(),
    selection: object<SelectionTarget>(),
    edit: object<EditSession>(),
    interaction: object<EditorStableInteractionState>(),
  }).from({
      read: (document) => document.state,
      write: (document, next) => ({
        ...document,
        state: next as EditorStateDocument['state'],
      }),
  }).changes(({ object }) => ({
      tool: [object('tool').deep()],
      draw: [object('draw').deep()],
      selection: [object('selection').deep()],
      edit: [object('edit').deep()],
      interaction: [object('interaction').deep()],
    })),
  hover: singleton<EditorStateDocument, EditorHoverState>()({
    node: field<NodeId | null>(),
    edge: field<EdgeId | null>(),
    mindmap: field<MindmapId | null>(),
    group: field<GroupId | null>(),
    selectionBox: field<boolean>(),
  }).from({
      read: (document) => document.hover,
      write: (document, next) => ({
        ...document,
        hover: next as EditorHoverState,
      }),
  }).changes(({ field }) => ({
      node: [field('node')],
      edge: [field('edge')],
      mindmap: [field('mindmap')],
      group: [field('group')],
      selectionBox: [field('selectionBox')],
    })),
  preview: {
    node: map<EditorStateDocument, NodeId, PreviewNodeEntry>()({
      patch: object<NodePreview['patch']>(),
      presentation: object<NodePreview['presentation']>(),
      hovered: field<boolean>(),
      hidden: field<boolean>(),
    }).from({
        read: (document) => Object.fromEntries(
          Object.entries(document.preview.node).map(([id, preview]) => [
            id,
            preview
              ? {
                  id: id as NodeId,
                  ...preview
                }
              : undefined
          ])
        ),
        write: (document, next) => ({
          ...document,
          preview: {
            ...document.preview,
            node: Object.fromEntries(
              Object.entries(next as Readonly<Record<NodeId, PreviewNodeEntry | undefined>>).map(([id, preview]) => [
                id,
                preview
                  ? {
                      patch: preview.patch,
                      presentation: preview.presentation,
                      hovered: preview.hovered,
                      hidden: preview.hidden
                    }
                  : undefined
              ])
            ) as PreviewInput['node']
          }
        }),
      }).changes(({ object, field }) => ({
        patch: [object('patch').deep()],
        presentation: [object('presentation').deep()],
        hovered: [field('hovered')],
        hidden: [field('hidden')],
      })),
    edge: map<EditorStateDocument, EdgeId, PreviewEdgeEntry>()({
      patch: object<EdgePreview['patch']>(),
      activeRouteIndex: field<number | undefined>(),
    }).from({
        read: (document) => Object.fromEntries(
          Object.entries(document.preview.edge).map(([id, preview]) => [
            id,
            preview
              ? {
                  id: id as EdgeId,
                  ...preview
                }
              : undefined
          ])
        ),
        write: (document, next) => ({
          ...document,
          preview: {
            ...document.preview,
            edge: Object.fromEntries(
              Object.entries(next as Readonly<Record<EdgeId, PreviewEdgeEntry | undefined>>).map(([id, preview]) => [
                id,
                preview
                  ? {
                      patch: preview.patch,
                      activeRouteIndex: preview.activeRouteIndex
                    }
                  : undefined
              ])
            ) as PreviewInput['edge']
          }
        }),
      }).changes(({ object, field }) => ({
        patch: [object('patch').deep()],
        activeRouteIndex: [field('activeRouteIndex')],
      })),
    mindmap: map<EditorStateDocument, MindmapId, PreviewMindmapRecordEntry>()({
      rootMove: object<MindmapPreviewEntry['rootMove']>(),
      subtreeMove: object<MindmapPreviewEntry['subtreeMove']>(),
    }).from({
        read: (document) => Object.fromEntries(
          Object.entries(document.preview.mindmap).map(([id, preview]) => [
            id,
            preview
              ? {
                  id: id as MindmapId,
                  ...preview
                }
              : undefined
          ])
        ),
        write: (document, next) => ({
          ...document,
          preview: {
            ...document.preview,
            mindmap: Object.fromEntries(
              Object.entries(next as Readonly<Record<MindmapId, PreviewMindmapRecordEntry | undefined>>).map(([id, preview]) => [
                id,
                preview
                  ? {
                      rootMove: preview.rootMove,
                      subtreeMove: preview.subtreeMove
                    }
                  : undefined
              ])
            ) as PreviewInput['mindmap']
          }
        }),
      }).changes(({ object }) => ({
        rootMove: [object('rootMove').deep()],
        subtreeMove: [object('subtreeMove').deep()],
      })),
    selection: singleton<EditorStateDocument, PreviewInput['selection']>()({
      marquee: field<PreviewInput['selection']['marquee']>(),
      guides: object<PreviewInput['selection']['guides']>(),
    }).from({
        read: (document) => document.preview.selection,
        write: (document, next) => ({
          ...document,
          preview: {
            ...document.preview,
            selection: next as PreviewInput['selection']
          }
        }),
      }).changes(({ object, field }) => ({
        marquee: [field('marquee')],
        guides: [object('guides').deep()],
      })),
    draw: singleton<EditorStateDocument, PreviewDrawValue>()({
      current: field<PreviewInput['draw']>(),
    }).from({
        read: (document) => ({
          current: document.preview.draw
        }),
        write: (document, next) => ({
          ...document,
          preview: {
            ...document.preview,
            draw: (next as PreviewDrawValue).current
          }
        }),
      }).changes(({ field }) => ({
        current: [field('current')],
      })),
    edgeGuide: singleton<EditorStateDocument, PreviewEdgeGuideValue>()({
      current: field<EdgeGuidePreview | undefined>(),
    }).from({
        read: (document) => ({
          current: document.preview.edgeGuide
        }),
        write: (document, next) => ({
          ...document,
          preview: {
            ...document.preview,
            edgeGuide: (next as PreviewEdgeGuideValue).current
          }
        }),
      }).changes(({ field }) => ({
        current: [field('current')],
      })),
  },
})
