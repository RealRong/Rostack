import { geometry as geometryApi, type ContainerRect, type ViewportLimits, type WheelInput } from '@whiteboard/core/geometry'
import { selection as selectionApi, type SelectionTarget } from '@whiteboard/core/selection'
import type { Point, Viewport } from '@whiteboard/core/types'
import { record as draftRecord } from '@shared/draft'
import {
  MutationEngine,
  type MutationCompileHandlerTable,
  type MutationCurrent,
  type MutationPorts,
  type MutationResult
} from '@shared/mutation/engine'
import type {
  MutationCommitRecord
} from '@shared/mutation'
import { equal, store } from '@shared/core'
import type {
  DrawState
} from '@whiteboard/editor/session/draw/state'
import type { Tool } from '@whiteboard/editor/types/tool'
import type { EditSession } from '@whiteboard/editor/session/edit'
import type {
  EditorInputPreviewState
} from '@whiteboard/editor/session/preview/types'
import type {
  ViewportInputRuntime,
  ViewportRead,
  ViewportRuntime
} from '@whiteboard/editor/session/viewport'
import {
  buildEditorStateDocument,
  isDrawEqual,
  isEditSessionEqual,
  isInteractionStateEqual,
  isPreviewEqual,
  isSelectionEqual,
  isToolEqual,
  isViewportEqual,
  normalizeEditSession,
  normalizeEditorStateDocument,
  normalizeInteractionStateValue,
  normalizeTool,
  normalizeViewportValue,
  type EditorInteractionStateValue,
  type EditorStateDocument
} from './document'
import { editorStateRegistry } from './entities'
import type {
  EditorCommand,
  EditorStateMutationTable
} from './intents'

type EditorStateReader = MutationCurrent<EditorStateDocument>['document']
type EditorStateProgram = MutationPorts<typeof editorStateRegistry>
type EditorStateOperation = {
  type: string
}

const createEditorStateReader = (
  readDocument: () => EditorStateDocument
): EditorStateReader => readDocument()

const compileHandlers: MutationCompileHandlerTable<
  EditorStateMutationTable,
  EditorStateDocument,
  EditorStateProgram,
  EditorStateReader
> = {
  'tool.set': (input) => {
    const {
      document,
      intent,
      program
    } = input
    program.tool.patch(draftRecord.diff(
      {
        value: document.tool.value
      },
      {
        value: intent.tool
      }
    ))
  },
  'draw.set': (input) => {
    const {
      document,
      intent,
      program
    } = input
    program.draw.patch(draftRecord.diff(
      {
        value: document.draw.value
      },
      {
        value: intent.state
      }
    ))
  },
  'selection.set': (input) => {
    const {
      document,
      intent,
      program
    } = input
    program.selection.patch(draftRecord.diff(
      {
        value: document.selection.value
      },
      {
        value: intent.selection
      }
    ))
  },
  'edit.set': (input) => {
    const {
      document,
      intent,
      program
    } = input
    program.edit.patch(draftRecord.diff(
      {
        value: document.edit.value
      },
      {
        value: intent.edit
      }
    ))
  },
  'interaction.set': (input) => {
    const {
      document,
      intent,
      program
    } = input
    program.interaction.patch(draftRecord.diff(
      {
        value: document.interaction.value
      },
      {
        value: intent.interaction
      }
    ))
  },
  'preview.set': (input) => {
    const {
      document,
      intent,
      program
    } = input
    program.preview.patch(draftRecord.diff(
      {
        value: document.preview.value
      },
      {
        value: intent.preview
      }
    ))
  },
  'viewport.set': (input) => {
    const {
      document,
      intent,
      program
    } = input
    program.viewport.patch(draftRecord.diff(
      {
        value: document.viewport.value
      },
      {
        value: intent.viewport
      }
    ))
  }
}

const assertEditorStateCommit = <T,>(
  result: MutationResult<T, unknown>
): T => {
  if (!result.ok) {
    throw new Error(result.error.message)
  }

  return result.data
}

const toCommandList = (
  command: EditorCommand | readonly EditorCommand[]
): readonly EditorCommand[] => {
  if (Array.isArray(command)) {
    return command
  }

  return [command as EditorCommand]
}

const syncStateStore = <T,>(
  target: {
    set: (value: T) => void
  },
  read: () => T
) => {
  target.set(read())
}

const createStateStores = (
  document: EditorStateDocument
) => ({
  tool: store.createNormalizedValue<Tool>({
    initial: document.tool.value,
    normalize: normalizeTool,
    isEqual: isToolEqual
  }),
  draw: store.createNormalizedValue<DrawState>({
    initial: document.draw.value,
    isEqual: isDrawEqual
  }),
  selection: store.createNormalizedValue<SelectionTarget>({
    initial: document.selection.value,
    normalize: selectionApi.target.normalize,
    isEqual: isSelectionEqual
  }),
  edit: store.createNormalizedValue<EditSession>({
    initial: document.edit.value,
    normalize: normalizeEditSession,
    isEqual: isEditSessionEqual
  }),
  interaction: store.createNormalizedValue<EditorInteractionStateValue>({
    initial: document.interaction.value,
    normalize: normalizeInteractionStateValue,
    isEqual: isInteractionStateEqual
  }),
  preview: store.createNormalizedValue<EditorInputPreviewState>({
    initial: document.preview.value,
    isEqual: isPreviewEqual
  }),
  viewport: store.createNormalizedValue<Viewport>({
    initial: document.viewport.value,
    normalize: normalizeViewportValue,
    isEqual: isViewportEqual
  })
})

const createViewportRuntime = (input: {
  initialViewport: Viewport
  viewportStore: EditorStateRuntime['stores']['viewport']['store']
  setViewport: (nextViewport: Viewport) => boolean
}): ViewportRuntime => {
  const initialLimits = geometryApi.viewport.defaultLimits
  const initialViewport = geometryApi.viewport.normalize(
    input.initialViewport,
    initialLimits
  )
  let rect = geometryApi.viewport.emptyContainerRect
  let limits = initialLimits

  const readViewport = (): Viewport => input.viewportStore.get()

  const setViewport = (
    nextViewport: Viewport
  ): boolean => {
    const normalized = geometryApi.viewport.normalize(nextViewport, limits)
    if (geometryApi.viewport.isSame(readViewport(), normalized)) {
      return false
    }

    return input.setViewport(normalized)
  }

  const readScreenPoint = (
    clientX: number,
    clientY: number
  ): Point => geometryApi.viewport.clientToScreenPoint(clientX, clientY, rect)

  const readPointer = (
    inputPoint: {
      clientX: number
      clientY: number
    }
  ) => {
    const screen = readScreenPoint(inputPoint.clientX, inputPoint.clientY)

    return {
      screen,
      world: geometryApi.viewport.screenToWorld(screen, readViewport(), rect)
    }
  }

  const read: ViewportRead = {
    get: readViewport,
    subscribe: input.viewportStore.subscribe,
    pointer: readPointer,
    worldToScreen: (point) => geometryApi.viewport.worldToScreen(point, readViewport(), rect),
    worldRect: () => geometryApi.rect.fromPoints(
      geometryApi.viewport.screenToWorld({
        x: 0,
        y: 0
      }, readViewport(), rect),
      geometryApi.viewport.screenToWorld({
        x: rect.width,
        y: rect.height
      }, readViewport(), rect)
    )
  }

  const inputRuntime: ViewportInputRuntime = {
    screenPoint: readScreenPoint,
    size: () => ({
      width: rect.width,
      height: rect.height
    })
  }

  const resolve = {
    set: (viewport: Viewport): Viewport => geometryApi.viewport.normalize(
      viewport,
      limits
    ),
    panBy: (delta: Point): Viewport | null => {
      if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y)) {
        return null
      }

      return geometryApi.viewport.pan(
        readViewport(),
        delta
      )
    },
    zoomTo: (
      zoom: number,
      anchor?: Point
    ): Viewport | null => {
      if (!Number.isFinite(zoom) || zoom <= 0) {
        return null
      }

      const current = readViewport()
      const factor = current.zoom === 0
        ? zoom
        : zoom / current.zoom
      if (!Number.isFinite(factor) || factor <= 0) {
        return null
      }

      return geometryApi.viewport.zoom(
        current,
        factor,
        anchor
      )
    },
    fit: (
      bounds: ReturnType<ViewportRead['worldRect']>,
      padding: number = geometryApi.viewport.fitPadding
    ): Viewport => geometryApi.viewport.fitToRect({
      viewport: readViewport(),
      rect,
      bounds,
      limits,
      padding
    }),
    reset: (): Viewport => initialViewport,
    panScreenBy: (deltaScreen: Point) => {
      if (!Number.isFinite(deltaScreen.x) || !Number.isFinite(deltaScreen.y)) {
        return null
      }

      return geometryApi.viewport.applyScreenPan(
        readViewport(),
        deltaScreen
      )
    },
    wheel: (
      wheelInput: WheelInput,
      wheelSensitivity: number
    ): Viewport => geometryApi.viewport.applyWheelInput({
      viewport: readViewport(),
      input: wheelInput,
      rect,
      limits,
      wheelSensitivity: Math.max(0, wheelSensitivity)
    })
  }

  return {
    read,
    resolve,
    input: inputRuntime,
    setRect: (nextRect: ContainerRect) => {
      if (equal.sameBox(rect, nextRect)) {
        return
      }

      rect = {
        left: nextRect.left,
        top: nextRect.top,
        width: nextRect.width,
        height: nextRect.height
      }
    },
    setLimits: (nextLimits: ViewportLimits) => {
      const normalized = geometryApi.viewport.normalizeLimits(nextLimits)
      if (
        limits.minZoom === normalized.minZoom
        && limits.maxZoom === normalized.maxZoom
      ) {
        return
      }

      limits = normalized
      setViewport(readViewport())
    }
  }
}

export interface EditorStateRuntime {
  engine: MutationEngine<
    EditorStateDocument,
    EditorStateMutationTable,
    EditorStateOperation,
    EditorStateReader,
    void,
    string,
    EditorStateProgram
  >
  stores: ReturnType<typeof createStateStores>
  state: {
    tool: ReturnType<typeof createStateStores>['tool']['store']
    draw: ReturnType<typeof createStateStores>['draw']['store']
    selection: ReturnType<typeof createStateStores>['selection']['store']
    edit: ReturnType<typeof createStateStores>['edit']['store']
  }
  dispatch: (
    command: EditorCommand | readonly EditorCommand[]
  ) => void
  commits: {
    subscribe: (
      listener: (commit: MutationCommitRecord<EditorStateDocument, EditorStateOperation>) => void
    ) => () => void
  }
  viewport: ViewportRuntime
  dispose(): void
}

export const createEditorStateRuntime = (input: {
  initialTool: Tool
  initialDrawState: DrawState
  initialViewport: Viewport
}): EditorStateRuntime => {
  const engine = new MutationEngine<
    EditorStateDocument,
    EditorStateMutationTable,
    EditorStateOperation,
    EditorStateReader,
    void,
    string,
    EditorStateProgram
  >({
    document: buildEditorStateDocument({
      tool: input.initialTool,
      draw: input.initialDrawState,
      viewport: input.initialViewport
    }),
    normalize: normalizeEditorStateDocument,
    createReader: createEditorStateReader,
    registry: editorStateRegistry,
    compile: compileHandlers,
    history: false
  })
  const stores = createStateStores(engine.document())

  const unsubscribeWatch = engine.watch((current) => {
    syncStateStore(stores.tool, () => current.document.tool.value)
    syncStateStore(stores.draw, () => current.document.draw.value)
    syncStateStore(stores.selection, () => current.document.selection.value)
    syncStateStore(stores.edit, () => current.document.edit.value)
    syncStateStore(stores.interaction, () => current.document.interaction.value)
    syncStateStore(stores.preview, () => current.document.preview.value)
    syncStateStore(stores.viewport, () => current.document.viewport.value)
  })

  const setViewport = (
    nextViewport: Viewport
  ): boolean => {
    const normalized = normalizeViewportValue(nextViewport)
    if (isViewportEqual(stores.viewport.read(), normalized)) {
      return false
    }

    dispatch({
      type: 'viewport.set',
      viewport: normalized
    })
    return true
  }

  const dispatch = (
    command: EditorCommand | readonly EditorCommand[]
  ) => {
    toCommandList(command).forEach((entry) => {
      assertEditorStateCommit(engine.execute(entry))
    })
  }

  const viewport = createViewportRuntime({
    initialViewport: input.initialViewport,
    viewportStore: stores.viewport.store,
    setViewport
  })

  return {
    engine,
    stores,
    state: {
      tool: stores.tool.store,
      draw: stores.draw.store,
      selection: stores.selection.store,
      edit: stores.edit.store
    },
    dispatch,
    commits: {
      subscribe: (listener) => engine.subscribe(listener)
    },
    viewport,
    dispose: () => {
      unsubscribeWatch()
    }
  }
}
