import {
  createMutationDelta,
  type MutationDeltaInput
} from '@shared/mutation'
import type {
  SceneUpdateInput
} from '../contracts/editor'
import type {
  DrawState
} from '@whiteboard/editor/schema/draw-state'
import {
  buildEditorStateDocument
} from '@whiteboard/editor/state/document'
import type {
  EditorStateMutationDelta
} from '@whiteboard/editor/state/runtime'
import {
  editorStateMutationSchema
} from '@whiteboard/editor/state/model'
import { createEmptyDocumentSnapshot } from '../projection/state'
import {
  whiteboardMutationSchema
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

export const createEmptyRuntimeInputDelta = (): EditorStateMutationDelta => createMutationDelta(
  editorStateMutationSchema,
  {}
)

export const createEditorStateInputDelta = (
  input: MutationDeltaInput
): EditorStateMutationDelta => createMutationDelta(
  editorStateMutationSchema,
  input
)

export const createEmptyInput = (): SceneUpdateInput => ({
  document: {
    rev: 0,
    snapshot: createEmptyDocumentSnapshot().document,
    delta: createMutationDelta(whiteboardMutationSchema, {
      changes: EMPTY_MUTATION_CHANGES
    })
  },
  editor: {
    snapshot: buildEditorStateDocument({
      tool: {
        type: 'select'
      },
      draw: EMPTY_DRAW_STATE,
      interaction: {
        mode: 'idle',
        chrome: false,
        space: false
      }
    }),
    delta: createEmptyRuntimeInputDelta()
  }
})
