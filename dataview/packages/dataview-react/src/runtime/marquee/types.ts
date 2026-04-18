import type { ItemId } from '@dataview/engine'
import type {
  Box,
  Point
} from '@shared/dom'
import type { ValueStore } from '@shared/core'
import type { ItemSelectionSnapshot } from '@dataview/runtime/selection'

export type MarqueeMode = 'replace' | 'add' | 'toggle'

export interface MarqueeSessionState {
  mode: MarqueeMode
  start: Point
  current: Point
  rect: Box
  hitIds: readonly ItemId[]
  baseSelection: ItemSelectionSnapshot
}

export interface MarqueeScene {
  hitTest(rect: Box): readonly ItemId[]
}

export interface MarqueeApi {
  store: ValueStore<MarqueeSessionState | null>
  get(): MarqueeSessionState | null
  start(session: MarqueeSessionState): void
  update(session: MarqueeSessionState): void
  clear(): void
  registerScene(scene: MarqueeScene): () => void
  getScene(): MarqueeScene | undefined
}
