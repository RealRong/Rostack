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

type EdgeGuideValue = PreviewInput['edgeGuide'] | undefined

export type EditorStateIntent =
  | {
      type: 'tool.set'
      tool: Tool
    }
  | {
      type: 'draw.set'
      state: DrawState
    }
  | {
      type: 'selection.set'
      selection: SelectionTarget
    }
  | {
      type: 'edit.set'
      edit: EditSession
    }
  | {
      type: 'interaction.set'
      interaction: EditorStableInteractionState
    }
  | {
      type: 'hover.set'
      hover: EditorHoverState
    }
  | {
      type: 'preview.node.set'
      node: PreviewInput['node']
    }
  | {
      type: 'preview.edge.set'
      edge: PreviewInput['edge']
    }
  | {
      type: 'preview.mindmap.set'
      mindmap: PreviewInput['mindmap']
    }
  | {
      type: 'preview.selection.set'
      selection: PreviewInput['selection']
    }
  | {
      type: 'preview.draw.set'
      draw: PreviewInput['draw']
    }
  | {
      type: 'preview.edgeGuide.set'
      edgeGuide: EdgeGuideValue
    }
  | {
      type: 'preview.reset'
    }

export type EditorCommand = EditorStateIntent

export type EditorDispatchUpdater = (
  state: import('./document').EditorStateDocument
) => EditorCommand | readonly EditorCommand[] | null

export type EditorDispatchInput =
  | EditorCommand
  | readonly EditorCommand[]
  | EditorDispatchUpdater
