import { geometry as geometryApi, type ContainerRect, type ViewportLimits, type WheelInput } from '@whiteboard/core/geometry'
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
import { equal } from '@shared/core'
import type {
  DrawState
} from '@whiteboard/editor/session/draw/state'
import type { Tool } from '@whiteboard/editor/types/tool'
import type {
  ViewportInputRuntime,
  ViewportRead,
  ViewportRuntime
} from '@whiteboard/editor/session/viewport'
import {
  EMPTY_PREVIEW_STATE
} from '@whiteboard/editor/preview/state'
import {
  buildEditorStateDocument,
  isViewportEqual,
  normalizeEditorStateDocument,
  normalizeViewportValue,
  type EditorStateDocument
} from './document'
import { editorStateRegistry } from './entities'
import type {
  EditorCommand,
  EditorDispatchInput,
  EditorDispatchUpdater,
  EditorStateMutationTable
} from './intents'
import { EMPTY_HOVER_STATE } from '@whiteboard/editor/input/hover/store'

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
  'tool.set': ({ document, intent, program }) => {
    program.state.patch(draftRecord.diff(
      {
        tool: document.state.tool
      },
      {
        tool: intent.tool
      }
    ))
  },
  'draw.set': ({ document, intent, program }) => {
    program.state.patch(draftRecord.diff(
      {
        draw: document.state.draw
      },
      {
        draw: intent.state
      }
    ))
  },
  'selection.set': ({ document, intent, program }) => {
    program.state.patch(draftRecord.diff(
      {
        selection: document.state.selection
      },
      {
        selection: intent.selection
      }
    ))
  },
  'edit.set': ({ document, intent, program }) => {
    program.state.patch(draftRecord.diff(
      {
        edit: document.state.edit
      },
      {
        edit: intent.edit
      }
    ))
  },
  'interaction.set': ({ document, intent, program }) => {
    program.state.patch(draftRecord.diff(
      {
        interaction: document.state.interaction
      },
      {
        interaction: intent.interaction
      }
    ))
  },
  'viewport.set': ({ document, intent, program }) => {
    program.state.patch(draftRecord.diff(
      {
        viewport: document.state.viewport
      },
      {
        viewport: intent.viewport
      }
    ))
  },
  'overlay.hover.set': ({ document, intent, program }) => {
    program.overlay.patch(draftRecord.diff(
      {
        hover: document.overlay.hover
      },
      {
        hover: intent.hover
      }
    ))
  },
  'overlay.preview.set': ({ document, intent, program }) => {
    program.overlay.patch(draftRecord.diff(
      {
        preview: document.overlay.preview
      },
      {
        preview: intent.preview
      }
    ))
  },
  'overlay.reset': ({ document, program }) => {
    program.overlay.patch(draftRecord.diff(
      {
        hover: document.overlay.hover,
        preview: document.overlay.preview
      },
      {
        hover: EMPTY_HOVER_STATE,
        preview: EMPTY_PREVIEW_STATE
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

const createViewportRuntime = (input: {
  initialViewport: Viewport
  readViewport: () => Viewport
  subscribeViewport: (listener: () => void) => () => void
  setViewport: (nextViewport: Viewport) => boolean
}): ViewportRuntime => {
  const initialLimits = geometryApi.viewport.defaultLimits
  const initialViewport = geometryApi.viewport.normalize(
    input.initialViewport,
    initialLimits
  )
  let rect = geometryApi.viewport.emptyContainerRect
  let limits = initialLimits

  const setViewport = (
    nextViewport: Viewport
  ): boolean => {
    const normalized = geometryApi.viewport.normalize(nextViewport, limits)
    if (geometryApi.viewport.isSame(input.readViewport(), normalized)) {
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
      world: geometryApi.viewport.screenToWorld(screen, input.readViewport(), rect)
    }
  }

  const read: ViewportRead = {
    get: input.readViewport,
    subscribe: input.subscribeViewport,
    pointer: readPointer,
    worldToScreen: (point) => geometryApi.viewport.worldToScreen(point, input.readViewport(), rect),
    worldRect: () => geometryApi.rect.fromPoints(
      geometryApi.viewport.screenToWorld({
        x: 0,
        y: 0
      }, input.readViewport(), rect),
      geometryApi.viewport.screenToWorld({
        x: rect.width,
        y: rect.height
      }, input.readViewport(), rect)
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
        input.readViewport(),
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

      const current = input.readViewport()
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
      viewport: input.readViewport(),
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
        input.readViewport(),
        deltaScreen
      )
    },
    wheel: (
      wheelInput: WheelInput,
      wheelSensitivity: number
    ): Viewport => geometryApi.viewport.applyWheelInput({
      viewport: input.readViewport(),
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
      setViewport(input.readViewport())
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
  snapshot(): EditorStateDocument
  dispatch: (
    command: EditorDispatchInput
  ) => void
  commits: {
    subscribe: (
      listener: (commit: MutationCommitRecord<EditorStateDocument, EditorStateOperation>) => void
    ) => () => void
  }
  flush(): void
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

  let stagedDocument = engine.document()
  let pendingCommands: EditorCommand[] = []
  const commitListeners = new Set<(
    commit: MutationCommitRecord<EditorStateDocument, EditorStateOperation>
  ) => void>()

  engine.subscribe((commit) => {
    stagedDocument = commit.document
    commitListeners.forEach((listener) => {
      listener(commit)
    })
  })

  const applyCommand = (
    document: EditorStateDocument,
    command: EditorCommand
  ): EditorStateDocument => {
    switch (command.type) {
      case 'tool.set':
        return normalizeEditorStateDocument({
          ...document,
          state: {
            ...document.state,
            tool: command.tool
          }
        })
      case 'draw.set':
        return normalizeEditorStateDocument({
          ...document,
          state: {
            ...document.state,
            draw: command.state
          }
        })
      case 'selection.set':
        return normalizeEditorStateDocument({
          ...document,
          state: {
            ...document.state,
            selection: command.selection
          }
        })
      case 'edit.set':
        return normalizeEditorStateDocument({
          ...document,
          state: {
            ...document.state,
            edit: command.edit
          }
        })
      case 'interaction.set':
        return normalizeEditorStateDocument({
          ...document,
          state: {
            ...document.state,
            interaction: command.interaction
          }
        })
      case 'viewport.set':
        return normalizeEditorStateDocument({
          ...document,
          state: {
            ...document.state,
            viewport: command.viewport
          }
        })
      case 'overlay.hover.set':
        return normalizeEditorStateDocument({
          ...document,
          overlay: {
            ...document.overlay,
            hover: command.hover
          }
        })
      case 'overlay.preview.set':
        return normalizeEditorStateDocument({
          ...document,
          overlay: {
            ...document.overlay,
            preview: command.preview
          }
        })
      case 'overlay.reset':
        return normalizeEditorStateDocument({
          ...document,
          overlay: {
            hover: EMPTY_HOVER_STATE,
            preview: EMPTY_PREVIEW_STATE
          }
        })
      default:
        return document
    }
  }

  const flush = () => {
    if (pendingCommands.length === 0) {
      return
    }

    const commands = pendingCommands
    pendingCommands = []
    stagedDocument = normalizeEditorStateDocument(stagedDocument)
    assertEditorStateCommit(engine.execute(commands))
    stagedDocument = engine.document()
  }

  const dispatch = (
    command: EditorDispatchInput
  ) => {
    const resolved = typeof command === 'function'
      ? (command as EditorDispatchUpdater)(stagedDocument)
      : command
    if (!resolved) {
      return
    }

    toCommandList(resolved).forEach((entry) => {
      stagedDocument = applyCommand(stagedDocument, entry)
      pendingCommands.push(entry)
    })

    flush()
  }

  const dispatchNow = (
    command: EditorCommand | readonly EditorCommand[]
  ) => {
    toCommandList(command).forEach((entry) => {
      assertEditorStateCommit(engine.execute(entry))
    })
    stagedDocument = engine.document()
  }

  const subscribeViewport = (
    listener: () => void
  ) => engine.subscribe((commit) => {
    if (
      commit.delta.reset === true
      || commit.delta.has('state.viewport')
      || Object.keys(commit.delta.changes).some((key) => key.startsWith('state.viewport.'))
    ) {
      listener()
    }
  })

  const setViewport = (
    nextViewport: Viewport
  ): boolean => {
    const normalized = normalizeViewportValue(nextViewport)
    if (isViewportEqual(stagedDocument.state.viewport, normalized)) {
      return false
    }

    dispatchNow({
      type: 'viewport.set',
      viewport: normalized
    })
    return true
  }

  const viewport = createViewportRuntime({
    initialViewport: input.initialViewport,
    readViewport: () => engine.document().state.viewport,
    subscribeViewport,
    setViewport
  })

  return {
    engine,
    snapshot: () => stagedDocument,
    dispatch,
    commits: {
      subscribe: (listener) => {
        commitListeners.add(listener)
        return () => {
          commitListeners.delete(listener)
        }
      }
    },
    flush,
    viewport,
    dispose: () => {}
  }
}
