import type { AppearanceId } from '@dataview/react/runtime/currentView'
import type {
  Box,
  Point,
  RectItem
} from '@shared/dom'
import type { ValueStore } from '@shared/store'
import type { ViewId } from '@dataview/core/contracts'
import type { AutoPanTargets } from '@dataview/react/interaction/autoPan'
import type { Selection } from '@dataview/react/runtime/selection'

export type MarqueeMode = 'replace' | 'add' | 'toggle'

export interface MarqueeSessionState {
  ownerViewId: ViewId
  mode: MarqueeMode
  start: Point
  current: Point
  box: Box
  baseSelectedIds: readonly AppearanceId[]
}

export interface SelectionTarget extends RectItem<AppearanceId> { }

export interface MarqueeAdapter {
  viewId: ViewId
  canStart: (event: PointerEvent) => boolean
  getTargets?: () => readonly SelectionTarget[]
  getHitIds?: (session: MarqueeSessionState) => readonly AppearanceId[]
  order: () => readonly AppearanceId[]
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
