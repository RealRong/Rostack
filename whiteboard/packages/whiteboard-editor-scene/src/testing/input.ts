import { idDelta } from '@shared/delta'
import type {
  EdgeId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import { createWhiteboardMutationDelta } from '@whiteboard/engine/mutation'
import type {
  EditorDrawState,
  EditorProjectionDelta,
  Input,
  SceneUpdateInput,
  EditorInteractionMode
} from '../contracts/editor'
import {
  createEmptyEditorSceneRuntimeDelta
} from '../contracts/facts'
import { createRuntimeFacts } from '../projection/runtimeFacts'
import { createEmptyDocumentSnapshot } from '../projection/state'

const EMPTY_MUTATION_CHANGES = Object.freeze(
  Object.create(null)
) as Record<string, never>

const DEFAULT_DRAW_STYLE = Object.freeze({
  color: 'currentColor',
  width: 2
})

const EMPTY_DRAW_STATE: EditorDrawState = {
  pen: {
    slot: '1',
    slots: {
      '1': DEFAULT_DRAW_STYLE,
      '2': DEFAULT_DRAW_STYLE,
      '3': DEFAULT_DRAW_STYLE
    }
  },
  highlighter: {
    slot: '1',
    slots: {
      '1': DEFAULT_DRAW_STYLE,
      '2': DEFAULT_DRAW_STYLE,
      '3': DEFAULT_DRAW_STYLE
    }
  }
}

const readInteractionMode = (
  input: Input['runtime']['editor']['interaction']
): EditorInteractionMode => {
  switch (input.drag.kind) {
    case 'selection-move':
      return 'node-drag'
    case 'selection-marquee':
      return 'marquee'
    case 'selection-transform':
      return 'node-transform'
    case 'edge-connect':
      return 'edge-connect'
    case 'edge-move':
      return 'edge-drag'
    case 'edge-label':
      return 'edge-label'
    case 'edge-route':
      return 'edge-route'
    case 'draw':
      return 'draw'
    case 'mindmap-drag':
      return 'mindmap-drag'
    default:
      return 'idle'
  }
}

const readTouchedIds = <TId extends string>(
  delta: {
    added: ReadonlySet<TId>
    updated: ReadonlySet<TId>
    removed: ReadonlySet<TId>
  }
): readonly TId[] => [...idDelta.touched({
  added: new Set(delta.added),
  updated: new Set(delta.updated),
  removed: new Set(delta.removed)
})]

export const toSceneUpdateInput = (
  input: Input
): SceneUpdateInput => {
  const previewDelta = input.runtime.editor.delta.preview
  const hasPreviewDelta =
    idDelta.hasAny(previewDelta.nodes)
    || idDelta.hasAny(previewDelta.edges)
    || idDelta.hasAny(previewDelta.mindmaps)
    || previewDelta.marquee
    || previewDelta.guides
    || previewDelta.draw
    || previewDelta.edgeGuide
  const hasInteractionDelta =
    input.runtime.editor.delta.interaction
    || input.runtime.editor.delta.hover

  const delta: EditorProjectionDelta = {}

  if (input.runtime.editor.delta.tool) {
    delta.tool = true
  }
  if (input.runtime.editor.delta.selection) {
    delta.selection = true
  }
  if (input.runtime.editor.delta.edit) {
    delta.edit = {
      touchedDraftEdgeIds: readTouchedIds(input.runtime.editor.delta.draft.edges)
    }
  }
  if (hasInteractionDelta) {
    delta.interaction = {
      mode: input.runtime.editor.delta.interaction || undefined,
      chrome: input.runtime.editor.delta.interaction || undefined,
      space: undefined
    }
  }
  if (input.runtime.editor.delta.hover) {
    delta.hover = true
  }
  if (hasPreviewDelta) {
    delta.preview = {
      touchedNodeIds: readTouchedIds(previewDelta.nodes),
      touchedEdgeIds: readTouchedIds(previewDelta.edges),
      touchedMindmapIds: readTouchedIds(previewDelta.mindmaps),
      marquee: previewDelta.marquee,
      guides: previewDelta.guides,
      draw: previewDelta.draw,
      edgeGuide: previewDelta.edgeGuide,
      hover: false
    }
  }

  return {
    document: {
      snapshot: input.document.doc,
      rev: input.document.rev,
      delta: input.delta
    },
    editor: {
      snapshot: {
        state: {
          tool: input.runtime.editor.state.tool,
          draw: EMPTY_DRAW_STATE,
          selection: input.runtime.editor.interaction.selection,
          edit: input.runtime.editor.state.edit,
          interaction: {
            mode: readInteractionMode(input.runtime.editor.interaction),
            chrome: input.runtime.editor.interaction.chrome,
            space: false
          },
          viewport: {
            center: input.runtime.editor.view.center,
            zoom: input.runtime.editor.view.zoom
          }
        },
        overlay: {
          hover: input.runtime.editor.interaction.hover,
          preview: {
            base: input.runtime.editor.state.preview,
            transient: {
              nodes: {},
              edges: {},
              draw: null,
              selection: {
                guides: []
              },
              mindmap: null
            }
          }
        }
      },
      delta
    }
  }
}

export const createEmptyRuntimeInputDelta = (): Input['runtime']['editor']['delta'] => (
  createEmptyEditorSceneRuntimeDelta()
)

export const createEmptyInput = (): Input => {
  const state: Input['runtime']['editor']['state'] = {
    edit: null,
    draft: {
      edges: new Map()
    },
    preview: {
      nodes: {},
      edges: {},
      edgeGuide: undefined,
      draw: null,
      selection: {
        guides: []
      },
      mindmap: null
    },
    tool: {
      type: 'select'
    }
  }
  const interaction: Input['runtime']['editor']['interaction'] = {
    selection: {
      nodeIds: [],
      edgeIds: []
    },
    hover: {
      kind: 'none'
    },
    drag: {
      kind: 'idle'
    },
    chrome: false,
    editingEdge: false
  }
  const delta = createEmptyRuntimeInputDelta()

  return {
    document: {
      rev: 0,
      doc: createEmptyDocumentSnapshot().document
    },
    runtime: {
      editor: {
        state,
        interaction,
        view: {
          zoom: 1,
          center: {
            x: 0,
            y: 0
          },
          worldRect: {
            x: 0,
            y: 0,
            width: 0,
            height: 0
          }
        },
        facts: createRuntimeFacts({
          state,
          interaction,
          delta
        }),
        delta
      }
    },
    delta: createWhiteboardMutationDelta({
      changes: EMPTY_MUTATION_CHANGES
    })
  }
}
