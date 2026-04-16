import type { DrawMode } from '@whiteboard/editor/local/draw/model'

export type EdgePresetKey =
  | 'edge.line'
  | 'edge.arrow'
  | 'edge.elbow-arrow'
  | 'edge.fillet-arrow'
  | 'edge.curve-arrow'

export type InsertPresetKey = string

export type SelectTool = {
  type: 'select'
}

export type HandTool = {
  type: 'hand'
}

export type EdgeTool = {
  type: 'edge'
  preset: EdgePresetKey
}

export type InsertTool = {
  type: 'insert'
  preset: InsertPresetKey
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
