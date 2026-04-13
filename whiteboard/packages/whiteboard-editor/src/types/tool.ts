import type { DrawMode } from '../model/draw/model'

export type EdgePresetKey =
  | 'edge.straight'
  | 'edge.elbow'
  | 'edge.curve'

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
