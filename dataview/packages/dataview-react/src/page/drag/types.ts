import type { MutableRefObject } from 'react'
import { store } from '@shared/core'
import type { PointerPosition } from '@dataview/react/interaction/usePointerDragSession'

export type DragKind = 'row' | 'card'

export interface DragSpec {
  active: boolean
  kind: DragKind
  source: HTMLElement | null
  pointerRef: MutableRefObject<PointerPosition | null>
  offsetRef: MutableRefObject<PointerPosition>
  size: {
    width: number
    height: number
  }
  extraCount: number
  scrubSelectors?: readonly string[]
}

export interface DragApi {
  store: store.ReadStore<DragSpec | null>
  get(): DragSpec | null
  set(next: DragSpec | null): void
  clear(): void
}
