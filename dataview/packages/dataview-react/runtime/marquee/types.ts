import type { ItemId } from '@dataview/engine'
import type {
  Box,
  Point,
  RectItem
} from '@shared/dom'
import type { ValueStore } from '@shared/core'
import type { ViewId } from '@dataview/core/contracts'
import type { AutoPanTargets } from '#react/interaction/autoPan'
import type { Selection } from '#react/runtime/selection'

export type MarqueeMode = 'replace' | 'add' | 'toggle'

export interface MarqueeSessionState {
  ownerViewId: ViewId
  mode: MarqueeMode
  start: Point
  current: Point
  box: Box
  baseSelectedIds: readonly ItemId[]
}

export interface SelectionTarget extends RectItem<ItemId> { }

export interface MarqueeAdapter {
  viewId: ViewId
  canStart: (event: PointerEvent) => boolean
  getTargets?: () => readonly SelectionTarget[]
  getHitIds?: (session: MarqueeSessionState) => readonly ItemId[]
  order: () => readonly ItemId[]
  resolveAutoPanTargets?: () => AutoPanTargets | null
  previewSelection?: (selection: Selection) => void
  clearPreviewSelection?: () => void
  onStart?: (session: MarqueeSessionState) => void
  onEnd?: (session: MarqueeSessionState, selection: Selection) => void
  onCancel?: (session: MarqueeSessionState, selection: Selection) => void
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
