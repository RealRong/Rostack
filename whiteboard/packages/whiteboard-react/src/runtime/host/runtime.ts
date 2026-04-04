import type { Point } from '@whiteboard/core/types'
import type { InsertPresetCatalog } from '@whiteboard/editor'
import { createClipboardHostAdapter, type ClipboardHostAdapter } from './clipboard'
import { createHostInsertRuntime, type HostInsertRuntime } from './insert'
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
  insert: HostInsertRuntime
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

export const createHostRuntime = ({
  insertPresetCatalog
}: {
  insertPresetCatalog: InsertPresetCatalog
}): WhiteboardHostRuntime => {
  const insert = createHostInsertRuntime({
    catalog: insertPresetCatalog
  })

  return {
    pick: createPickRegistry(),
    clipboard: createClipboardHostAdapter(),
    pointerSession: createPointerSession(),
    selectionLock: createDocumentSelectionLock(),
    pointer: createHostPointerState(),
    insert
  }
}
