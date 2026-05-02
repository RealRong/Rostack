import {
  defineMutationSchema,
  namespace,
  collection,
  object,
  singleton,
  value,
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

export const editorStateMutationSchema = defineMutationSchema<EditorStateDocument>()({
  state: singleton<EditorStateDocument, EditorStateDocument['state']>()({
    access: {
      read: (document) => document.state,
      write: (document, next) => ({
        ...document,
        state: next as EditorStateDocument['state'],
      }),
    },
    members: {
      tool: object<Tool>(),
      draw: object<DrawState>(),
      selection: object<SelectionTarget>(),
      edit: object<EditSession>(),
      interaction: object<EditorStableInteractionState>(),
    },
    changes: ({ object }) => ({
      tool: [object('tool').deep()],
      draw: [object('draw').deep()],
      selection: [object('selection').deep()],
      edit: [object('edit').deep()],
      interaction: [object('interaction').deep()],
    }),
  }),
  hover: singleton<EditorStateDocument, EditorHoverState>()({
    access: {
      read: (document) => document.hover,
      write: (document, next) => ({
        ...document,
        hover: next as EditorHoverState,
      }),
    },
    members: {
      node: value<NodeId | null>(),
      edge: value<EdgeId | null>(),
      mindmap: value<MindmapId | null>(),
      group: value<GroupId | null>(),
      selectionBox: value<boolean>(),
    },
    changes: ({ value }) => ({
      node: [value('node')],
      edge: [value('edge')],
      mindmap: [value('mindmap')],
      group: [value('group')],
      selectionBox: [value('selectionBox')],
    }),
  }),
  preview: namespace({
    node: collection<EditorStateDocument, NodeId, PreviewNodeEntry>()({
      access: {
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
      },
      members: {
        patch: object<NodePreview['patch']>(),
        presentation: object<NodePreview['presentation']>(),
        hovered: value<boolean>(),
        hidden: value<boolean>(),
      },
      changes: ({ object, value }) => ({
        patch: [object('patch').deep()],
        presentation: [object('presentation').deep()],
        hovered: [value('hovered')],
        hidden: [value('hidden')],
      }),
    }),
    edge: collection<EditorStateDocument, EdgeId, PreviewEdgeEntry>()({
      access: {
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
      },
      members: {
        patch: object<EdgePreview['patch']>(),
        activeRouteIndex: value<number | undefined>(),
      },
      changes: ({ object, value }) => ({
        patch: [object('patch').deep()],
        activeRouteIndex: [value('activeRouteIndex')],
      }),
    }),
    mindmap: collection<EditorStateDocument, MindmapId, PreviewMindmapRecordEntry>()({
      access: {
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
      },
      members: {
        rootMove: object<MindmapPreviewEntry['rootMove']>(),
        subtreeMove: object<MindmapPreviewEntry['subtreeMove']>(),
      },
      changes: ({ object }) => ({
        rootMove: [object('rootMove').deep()],
        subtreeMove: [object('subtreeMove').deep()],
      }),
    }),
    selection: singleton<EditorStateDocument, PreviewInput['selection']>()({
      access: {
        read: (document) => document.preview.selection,
        write: (document, next) => ({
          ...document,
          preview: {
            ...document.preview,
            selection: next as PreviewInput['selection']
          }
        }),
      },
      members: {
        marquee: value<PreviewInput['selection']['marquee']>(),
        guides: object<PreviewInput['selection']['guides']>(),
      },
      changes: ({ object, value }) => ({
        marquee: [value('marquee')],
        guides: [object('guides').deep()],
      }),
    }),
    draw: singleton<EditorStateDocument, PreviewDrawValue>()({
      access: {
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
      },
      members: {
        current: value<PreviewInput['draw']>(),
      },
      changes: ({ value }) => ({
        current: [value('current')],
      }),
    }),
    edgeGuide: singleton<EditorStateDocument, PreviewEdgeGuideValue>()({
      access: {
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
      },
      members: {
        current: value<EdgeGuidePreview | undefined>(),
      },
      changes: ({ value }) => ({
        current: [value('current')],
      }),
    }),
  }),
})
