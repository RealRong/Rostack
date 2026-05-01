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
  input: Input['runtime']['interaction']
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
  const previewDelta = input.runtime.delta.session.preview
  const hasPreviewDelta =
    idDelta.hasAny(previewDelta.nodes)
    || idDelta.hasAny(previewDelta.edges)
    || idDelta.hasAny(previewDelta.mindmaps)
    || previewDelta.marquee
    || previewDelta.guides
    || previewDelta.draw
    || previewDelta.edgeGuide
  const hasInteractionDelta =
    input.runtime.delta.session.interaction
    || input.runtime.delta.session.hover

  const delta: EditorProjectionDelta = {}

  if (input.runtime.delta.session.tool) {
    delta.tool = true
  }
  if (input.runtime.delta.session.selection) {
    delta.selection = true
  }
  if (input.runtime.delta.session.edit) {
    delta.edit = {
      touchedDraftEdgeIds: readTouchedIds(input.runtime.delta.session.draft.edges)
    }
  }
  if (hasInteractionDelta) {
    delta.interaction = {
      mode: input.runtime.delta.session.interaction || undefined,
      chrome: input.runtime.delta.session.interaction || undefined,
      space: undefined
    }
  }
  if (input.runtime.delta.session.hover) {
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
          tool: input.runtime.session.tool,
          draw: EMPTY_DRAW_STATE,
          selection: input.runtime.interaction.selection,
          edit: input.runtime.session.edit,
          interaction: {
            mode: readInteractionMode(input.runtime.interaction),
            chrome: input.runtime.interaction.chrome,
            space: false
          },
          viewport: {
            center: input.runtime.view.center,
            zoom: input.runtime.view.zoom
          }
        },
        overlay: {
          hover: input.runtime.interaction.hover,
          preview: {
            base: input.runtime.session.preview,
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

export const createEmptyRuntimeInputDelta = (): Input['runtime']['delta'] => (
  createEmptyEditorSceneRuntimeDelta()
)

export const createEmptyInput = (): Input => {
  const session: Input['runtime']['session'] = {
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
  const interaction: Input['runtime']['interaction'] = {
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
      session,
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
        session,
        interaction,
        delta
      }),
      delta
    },
    delta: createWhiteboardMutationDelta({
      changes: EMPTY_MUTATION_CHANGES
    })
  }
}
