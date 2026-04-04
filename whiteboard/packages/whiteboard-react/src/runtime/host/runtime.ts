import type { Point } from '@whiteboard/core/types'
import {
  createEditorDrawState,
  createEditorHostViewport,
  createEditorInputPolicyState,
  type EditorHost,
  type EditorInputPolicyState
} from '@whiteboard/editor/host'
import type { DrawPreferences, InsertPresetCatalog } from '@whiteboard/editor'
import type { Viewport } from '@whiteboard/core/types'
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
  editorHost: EditorHost
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
  initialViewport,
  viewportLimits,
  inputPolicy,
  drawPreferences,
  insertPresetCatalog
}: {
  initialViewport: Viewport
  viewportLimits: {
    minZoom: number
    maxZoom: number
  }
  inputPolicy: {
    panEnabled: boolean
    wheelEnabled: boolean
    wheelSensitivity: number
  }
  drawPreferences: DrawPreferences
  insertPresetCatalog: InsertPresetCatalog
}): WhiteboardHostRuntime => {
  const viewport = createEditorHostViewport({
    initialViewport,
    limits: viewportLimits
  })
  const inputPolicyState = createEditorInputPolicyState(inputPolicy)
  const drawState = createEditorDrawState(drawPreferences)
  const insert = createHostInsertRuntime({
    catalog: insertPresetCatalog
  })

  return {
    pick: createPickRegistry(),
    clipboard: createClipboardHostAdapter(),
    pointerSession: createPointerSession(),
    selectionLock: createDocumentSelectionLock(),
    pointer: createHostPointerState(),
    editorHost: {
      viewport,
      inputPolicy: inputPolicyState,
      draw: drawState,
      insert: {
        get: insert.get
      }
    },
    insert
  }
}
