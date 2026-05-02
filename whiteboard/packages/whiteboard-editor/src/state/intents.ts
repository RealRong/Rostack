import type { PreviewInput } from '@whiteboard/editor-scene'
import type { Tool } from '@whiteboard/editor/schema/tool'
import type {
  DrawState
} from '@whiteboard/editor/schema/draw-state'
import type {
  EditSession
} from '@whiteboard/editor/schema/edit'
import type {
  SelectionTarget
} from '@whiteboard/core/selection'
import type {
  EditorHoverState,
  EditorStableInteractionState
} from './document'

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
  'hover.set': {
    intent: {
      type: 'hover.set'
      hover: EditorHoverState
    }
    output: void
  }
  'preview.node.set': {
    intent: {
      type: 'preview.node.set'
      node: PreviewInput['node']
    }
    output: void
  }
  'preview.edge.set': {
    intent: {
      type: 'preview.edge.set'
      edge: PreviewInput['edge']
    }
    output: void
  }
  'preview.mindmap.set': {
    intent: {
      type: 'preview.mindmap.set'
      mindmap: PreviewInput['mindmap']
    }
    output: void
  }
  'preview.selection.set': {
    intent: {
      type: 'preview.selection.set'
      selection: PreviewInput['selection']
    }
    output: void
  }
  'preview.draw.set': {
    intent: {
      type: 'preview.draw.set'
      draw: PreviewInput['draw']
    }
    output: void
  }
  'preview.edgeGuide.set': {
    intent: {
      type: 'preview.edgeGuide.set'
      edgeGuide: EdgeGuideValue
    }
    output: void
  }
  'preview.reset': {
    intent: {
      type: 'preview.reset'
    }
    output: void
  }
}

type EdgeGuideValue = PreviewInput['edgeGuide'] | undefined

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
