import type { ShapeKind } from '@whiteboard/core/node'
import type {
  MindmapNodeData,
  Point,
  SpatialNodeInput
} from '@whiteboard/core/types'
import type { EditField } from '@whiteboard/editor/local/session/edit'

export type InsertPresetGroup =
  | 'text'
  | 'frame'
  | 'sticky'
  | 'shape'
  | 'mindmap'

export type InsertPlacement = 'center' | 'point'

type InsertPresetBase = {
  key: string
  group: InsertPresetGroup
  label: string
  description?: string
}

export type NodeInsertPreset = InsertPresetBase & {
  kind: 'node'
  focus?: EditField
  placement?: InsertPlacement
  input: (world: Point) => Omit<SpatialNodeInput, 'position'>
}

export type MindmapTemplate = {
  key: string
  label: string
  description: string
  root: MindmapNodeData
  children?: readonly {
    data: MindmapNodeData
    side?: 'left' | 'right'
  }[]
}

export type MindmapInsertPreset = InsertPresetBase & {
  kind: 'mindmap'
  group: 'mindmap'
  description: string
  template: MindmapTemplate
}

export type StickyTone = {
  key: string
  label: string
  fill: string
}

export type InsertPreset =
  | NodeInsertPreset
  | MindmapInsertPreset

export type InsertPresetCatalog = {
  get: (key: string) => InsertPreset | undefined
  defaults: {
    text: string
    frame: string
    sticky: string
    mindmap: string
    shape: (kind: ShapeKind) => string
  }
}
