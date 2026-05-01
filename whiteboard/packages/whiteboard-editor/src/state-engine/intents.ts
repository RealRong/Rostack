import type { Viewport } from '@whiteboard/core/types'
import type { PreviewInput } from '@whiteboard/editor-scene'
import type { Tool } from '@whiteboard/editor/types/tool'
import type {
  DrawState
} from '@whiteboard/editor/session/draw/state'
import type {
  EditSession
} from '@whiteboard/editor/session/edit'
import type {
  SelectionTarget
} from '@whiteboard/core/selection'
import type {
  EditorStableInteractionState
} from './document'
import type {
  HoverState
} from '@whiteboard/editor/input/hover/store'

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
      interaction: EditorStableInteractionState
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
  'overlay.hover.set': {
    intent: {
      type: 'overlay.hover.set'
      hover: HoverState
    }
    output: void
  }
  'overlay.preview.set': {
    intent: {
      type: 'overlay.preview.set'
      preview: PreviewInput
    }
    output: void
  }
  'overlay.reset': {
    intent: {
      type: 'overlay.reset'
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

export type EditorCommand = EditorStateIntent

export type EditorDispatchUpdater = (
  state: import('./document').EditorStateDocument
) => EditorCommand | readonly EditorCommand[] | null

export type EditorDispatchInput =
  | EditorCommand
  | readonly EditorCommand[]
  | EditorDispatchUpdater
