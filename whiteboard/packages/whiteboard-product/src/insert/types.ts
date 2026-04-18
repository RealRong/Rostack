import type { Token } from '@shared/i18n'
import type {
  MindmapTemplate,
  NodeTemplate
} from '@whiteboard/core/types'
import type { ShapeKind } from '@whiteboard/core/node'

export type WhiteboardInsertGroup =
  | 'text'
  | 'frame'
  | 'sticky'
  | 'shape'
  | 'mindmap'

export type WhiteboardInsertPlacement = 'center' | 'point'
export type WhiteboardInsertEditField = 'text' | 'title'
export type WhiteboardMindmapInsertFocus = 'edit-root' | 'select-root'

export type WhiteboardInsertTemplate =
  | {
      kind: 'node'
      template: NodeTemplate
      placement?: WhiteboardInsertPlacement
      editField?: WhiteboardInsertEditField
    }
  | {
      kind: 'mindmap'
      template: MindmapTemplate
      focus?: WhiteboardMindmapInsertFocus
    }

type WhiteboardInsertPresetBase = {
  key: string
  group: WhiteboardInsertGroup
  label: string
  labelToken?: Token
  description?: string
  descriptionToken?: Token
}

export type WhiteboardNodeInsertPreset = WhiteboardInsertPresetBase & {
  kind: 'node'
  template: WhiteboardInsertTemplate & {
    kind: 'node'
  }
}

export type WhiteboardMindmapInsertPreset = WhiteboardInsertPresetBase & {
  kind: 'mindmap'
  group: 'mindmap'
  template: WhiteboardInsertTemplate & {
    kind: 'mindmap'
  }
}

export type WhiteboardInsertPreset =
  | WhiteboardNodeInsertPreset
  | WhiteboardMindmapInsertPreset

export type WhiteboardInsertCatalog = {
  get: (key: string) => WhiteboardInsertPreset | undefined
  defaults: {
    text: string
    frame: string
    sticky: string
    mindmap: string
    shape: (kind: ShapeKind) => string
  }
}
