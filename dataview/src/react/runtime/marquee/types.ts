import type { RefObject } from 'react'
import type { AppearanceId } from '@dataview/react/runtime/currentView'
import type { Box, Point } from '@dataview/dom/geometry'
import type { ValueStore } from '@dataview/runtime/store'
import type { ViewId } from '@dataview/core/contracts'

export type MarqueeMode = 'replace' | 'add' | 'toggle'

export interface MarqueeSessionState {
  ownerViewId: ViewId
  mode: MarqueeMode
  start: Point
  current: Point
  box: Box
  baseSelectedIds: readonly AppearanceId[]
}

export interface MarqueeAdapter {
  viewId: ViewId
  containerRef: RefObject<HTMLElement | null>
  canStart: (event: PointerEvent) => boolean
  resolveIds: (box: Box) => readonly AppearanceId[]
  order: () => readonly AppearanceId[]
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
