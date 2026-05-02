import { createMutationDelta } from '@shared/mutation'
import type {
  SceneUpdateInput
} from '../contracts/editor'
import type {
  DrawState
} from '@whiteboard/editor/schema/draw-state'
import type {
  EditorDelta
} from '@whiteboard/editor/state/delta'
import { createEmptyDocumentSnapshot } from '../projection/state'
import {
  whiteboardMutationModel
} from '@whiteboard/core/mutation'

const EMPTY_MUTATION_CHANGES = Object.freeze(
  Object.create(null)
) as Record<string, never>

const DEFAULT_DRAW_STYLE = Object.freeze({
  color: 'currentColor',
  width: 2
})

const EMPTY_DRAW_STATE: DrawState = {
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

export const toSceneUpdateInput = (
  input: SceneUpdateInput
): SceneUpdateInput => input

export const createEmptyRuntimeInputDelta = (): EditorDelta => ({})

export const createEmptyInput = (): SceneUpdateInput => ({
  document: {
    rev: 0,
    snapshot: createEmptyDocumentSnapshot().document,
    delta: createMutationDelta(whiteboardMutationModel, {
      changes: EMPTY_MUTATION_CHANGES
    })
  },
  editor: {
    snapshot: {
      state: {
        tool: {
          type: 'select'
        },
        draw: EMPTY_DRAW_STATE,
        selection: {
          nodeIds: [],
          edgeIds: []
        },
        edit: null,
        interaction: {
          mode: 'idle',
          chrome: false,
          space: false
        },
        viewport: {
          center: {
            x: 0,
            y: 0
          },
          zoom: 1
        }
      },
      overlay: {
        hover: {
          kind: 'none'
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
        }
      }
    },
    delta: createEmptyRuntimeInputDelta()
  }
})
