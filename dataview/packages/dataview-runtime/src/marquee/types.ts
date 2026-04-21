import type { ItemId } from '@dataview/engine'
import type {
  Box,
  Point
} from '@shared/dom'
import { store } from '@shared/core'
import type {
  ItemSelectionSnapshot,
  SelectionScope,
  SelectionSummary
} from '@dataview/runtime/selection'

export type MarqueeMode = 'replace' | 'add' | 'toggle'

export interface MarqueeSessionState {
  mode: MarqueeMode
  start: Point
  current: Point
  rect: Box
  hitIds: readonly ItemId[]
  baseSelection: ItemSelectionSnapshot
}

export interface MarqueeSessionApi {
  store: store.ReadStore<MarqueeSessionState | null>
  activeStore: store.ReadStore<boolean>
  preview: {
    membership: store.KeyedReadStore<ItemId, boolean | null>
    scopeSummary: store.KeyedReadStore<SelectionScope<ItemId>, SelectionSummary | null>
  }
  get(): MarqueeSessionState | null
}

export interface MarqueeIntentApi {
  start(input: {
    mode: MarqueeMode
    start: Point
    baseSelection: ItemSelectionSnapshot
  }): void
  update(input: {
    current: Point
    rect: Box
    hitIds: readonly ItemId[]
  }): void
  commit(): void
  cancel(): void
  clear(): void
}

export interface MarqueeController extends MarqueeSessionApi, MarqueeIntentApi {}
