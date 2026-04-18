import type {
  EdgeTemplate,
  MindmapTemplate,
  NodeTemplate
} from '@whiteboard/core/types'
import type { DrawMode } from '@whiteboard/editor/session/draw/model'
import type { EditField } from '@whiteboard/editor/session/edit'

export type SelectTool = {
  type: 'select'
}

export type HandTool = {
  type: 'hand'
}

export type EdgeTool = {
  type: 'edge'
  template: EdgeTemplate
}

export type InsertTemplate =
  | {
      kind: 'node'
      template: NodeTemplate
      placement?: 'point' | 'center'
      editField?: EditField
    }
  | {
      kind: 'mindmap'
      template: MindmapTemplate
      focus?: 'edit-root' | 'select-root'
    }

export type InsertTool = {
  type: 'insert'
  template: InsertTemplate
}

export type DrawTool = {
  type: 'draw'
  mode: DrawMode
}

export type Tool =
  | SelectTool
  | HandTool
  | EdgeTool
  | InsertTool
  | DrawTool
