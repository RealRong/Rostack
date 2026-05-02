import {
  defineMutationModel,
  mapFamily,
  record,
  singleton,
  value,
} from '@shared/mutation'
import type {
  SelectionTarget
} from '@whiteboard/core/selection'
import type {
  EdgeId,
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

export const editorStateMutationModel = defineMutationModel<EditorStateDocument>()({
  state: singleton<EditorStateDocument, EditorStateDocument['state']>()({
    access: {
      read: (document) => document.state,
      write: (document, next) => ({
        ...document,
        state: next as EditorStateDocument['state'],
      }),
    },
    members: {
      tool: record<Tool>(),
      draw: record<DrawState>(),
      selection: record<SelectionTarget>(),
      edit: record<EditSession>(),
      interaction: record<EditorStableInteractionState>(),
    },
    changes: ({ record }) => ({
      tool: [record('tool').deep()],
      draw: [record('draw').deep()],
      selection: [record('selection').deep()],
      edit: [record('edit').deep()],
      interaction: [record('interaction').deep()],
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
      group: value<string | null>(),
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
  'preview.node': mapFamily<EditorStateDocument, NodeId, PreviewNodeEntry>()({
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
      patch: record<NodePreview['patch']>(),
      presentation: record<NodePreview['presentation']>(),
      hovered: value<boolean>(),
      hidden: value<boolean>(),
    },
    changes: ({ record, value }) => ({
      patch: [record('patch').deep()],
      presentation: [record('presentation').deep()],
      hovered: [value('hovered')],
      hidden: [value('hidden')],
    }),
  }),
  'preview.edge': mapFamily<EditorStateDocument, EdgeId, PreviewEdgeEntry>()({
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
      patch: record<EdgePreview['patch']>(),
      activeRouteIndex: value<number | undefined>(),
    },
    changes: ({ record, value }) => ({
      patch: [record('patch').deep()],
      activeRouteIndex: [value('activeRouteIndex')],
    }),
  }),
  'preview.mindmap': mapFamily<EditorStateDocument, MindmapId, PreviewMindmapRecordEntry>()({
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
      rootMove: record<MindmapPreviewEntry['rootMove']>(),
      subtreeMove: record<MindmapPreviewEntry['subtreeMove']>(),
    },
    changes: ({ record }) => ({
      rootMove: [record('rootMove').deep()],
      subtreeMove: [record('subtreeMove').deep()],
    }),
  }),
  'preview.selection': singleton<EditorStateDocument, PreviewInput['selection']>()({
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
      guides: record<PreviewInput['selection']['guides']>(),
    },
    changes: ({ record, value }) => ({
      marquee: [value('marquee')],
      guides: [record('guides').deep()],
    }),
  }),
  'preview.draw': singleton<EditorStateDocument, PreviewDrawValue>()({
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
  'preview.edgeGuide': singleton<EditorStateDocument, PreviewEdgeGuideValue>()({
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
})
