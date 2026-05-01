import type { Viewport } from '@whiteboard/core/types'
import type { Tool } from '@whiteboard/editor/types/tool'
import type {
  DrawState
} from '@whiteboard/editor/session/draw/state'
import type {
  EditorInputPreviewState
} from '@whiteboard/editor/session/preview/types'
import type {
  EditSession
} from '@whiteboard/editor/session/edit'
import type {
  SelectionTarget
} from '@whiteboard/core/selection'
import type { EditorInteractionStateValue } from './document'
export type EditorStateIntentTable = {
  'tool.set': {
    intent: {
      type: 'tool.set'
      tool: Tool
    }
    output: void
  }
  'draw.set': {
    intent: {
      type: 'draw.set'
      state: DrawState
    }
    output: void
  }
  'selection.set': {
    intent: {
      type: 'selection.set'
      selection: SelectionTarget
    }
    output: void
  }
  'edit.set': {
    intent: {
      type: 'edit.set'
      edit: EditSession
    }
    output: void
  }
  'interaction.set': {
    intent: {
      type: 'interaction.set'
      interaction: EditorInteractionStateValue
    }
    output: void
  }
  'preview.set': {
    intent: {
      type: 'preview.set'
      preview: EditorInputPreviewState
    }
    output: void
  }
  'viewport.set': {
    intent: {
      type: 'viewport.set'
      viewport: Viewport
    }
    output: void
  }
}

export type EditorStateIntentKind = keyof EditorStateIntentTable & string

export type EditorStateMutationTable = {
  [K in EditorStateIntentKind]: {
    intent: EditorStateIntentTable[K]['intent']
    output: EditorStateIntentTable[K]['output']
  }
}

export type EditorStateIntent<K extends EditorStateIntentKind = EditorStateIntentKind> =
  EditorStateIntentTable[K]['intent']
