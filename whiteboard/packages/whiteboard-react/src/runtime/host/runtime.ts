import type { Point } from '@whiteboard/core/types'
import { createClipboardHostAdapter, type ClipboardHostAdapter } from './clipboard'
import { createPickRegistry, type PickRegistry } from './pickRegistry'
import { createPointerSession, type PointerSession } from './pointerSession'
import { createDocumentSelectionLock, type DocumentSelectionLock } from './selectionLock'

type HostPointerState = {
  get: () => Point | undefined
  set: (point: Point) => void
  clear: () => void
}

export type WhiteboardHostRuntime = {
  pick: PickRegistry
  clipboard: ClipboardHostAdapter
  pointerSession: PointerSession
  selectionLock: DocumentSelectionLock
  pointer: HostPointerState
}

const createHostPointerState = (): HostPointerState => {
  let current: Point | undefined

  return {
    get: () => current,
    set: (point) => {
      current = {
        x: point.x,
        y: point.y
      }
    },
    clear: () => {
      current = undefined
    }
  }
}

export const createHostRuntime = (): WhiteboardHostRuntime => ({
  pick: createPickRegistry(),
  clipboard: createClipboardHostAdapter(),
  pointerSession: createPointerSession(),
  selectionLock: createDocumentSelectionLock(),
  pointer: createHostPointerState()
})
