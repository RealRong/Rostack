import type { ItemId } from '@dataview/engine'
import type {
  Box,
  Point,
  RectItem
} from '@shared/dom'
import type { ValueStore } from '@shared/core'
import type { ViewId } from '@dataview/core/contracts'
import type { AutoPanTargets } from '@dataview/react/interaction/autoPan'
import type {
  ItemSelectionSnapshot,
  OrderedSelectionDomain
} from '@dataview/react/runtime/selection'

export type MarqueeMode = 'replace' | 'add' | 'toggle'

export interface MarqueeSessionState {
  ownerViewId: ViewId
  mode: MarqueeMode
  start: Point
  current: Point
  box: Box
  baseSelection: ItemSelectionSnapshot
}

export type SelectionTarget = RectItem<ItemId>

export interface MarqueeAdapter {
  viewId: ViewId
  canStart: (event: PointerEvent) => boolean
  getTargets?: () => readonly SelectionTarget[]
  getHitIds?: (session: MarqueeSessionState) => readonly ItemId[]
  domain: () => OrderedSelectionDomain<ItemId>
  resolveAutoPanTargets?: () => AutoPanTargets | null
  previewSelection?: (selection: ItemSelectionSnapshot) => void
  clearPreviewSelection?: () => void
  onStart?: (session: MarqueeSessionState) => void
  onEnd?: (session: MarqueeSessionState, selection: ItemSelectionSnapshot) => void
  onCancel?: (session: MarqueeSessionState, selection: ItemSelectionSnapshot) => void
  disabled?: boolean
}

export interface MarqueeApi {
  store: ValueStore<MarqueeSessionState | null>
  get(): MarqueeSessionState | null
  start(session: MarqueeSessionState): void
  update(session: MarqueeSessionState): void
  clear(): void
  registerAdapter(adapter: MarqueeAdapter): () => void
  getAdapter(viewId: ViewId): MarqueeAdapter | undefined
}
