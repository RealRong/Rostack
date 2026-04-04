import type { Point } from '@whiteboard/core/types'
import type { DrawBrushKind } from './tool'

export type DrawSlot =
  | '1'
  | '2'
  | '3'

export type BrushStyle = Readonly<{
  color: string
  width: number
}>

export type BrushStylePatch = Partial<BrushStyle>

export type DrawBrush = Readonly<{
  slot: DrawSlot
  slots: Readonly<Record<DrawSlot, BrushStyle>>
}>

export type DrawPreferences = Readonly<Record<DrawBrushKind, DrawBrush>>

export type ResolvedDrawStyle = Readonly<{
  kind: DrawBrushKind
  color: string
  width: number
  opacity: number
}>

export type DrawPreview = Readonly<{
  kind: DrawBrushKind
  style: ResolvedDrawStyle
  points: readonly Point[]
}>

export type DrawCommands = {
  set: (preferences: DrawPreferences) => void
  slot: (kind: DrawBrushKind, slot: DrawSlot) => void
  patch: (
    kind: DrawBrushKind,
    slot: DrawSlot,
    patch: BrushStylePatch
  ) => void
}
