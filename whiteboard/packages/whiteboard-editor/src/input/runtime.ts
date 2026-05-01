import { store } from '@shared/core'
import type { Engine } from '@whiteboard/engine'
import type { WhiteboardLayoutService } from '@whiteboard/core/layout'
import type { DocumentFrame } from '@whiteboard/editor-scene'
import { createInteractionRuntime } from '@whiteboard/editor/input/core/runtime'
import { createSnapRuntime, type SnapRuntime } from '@whiteboard/editor/input/core/snap'
import { createDrawBinding } from '@whiteboard/editor/input/features/draw'
import { createEdgeBinding } from '@whiteboard/editor/input/features/edge'
import { createSelectionBinding } from '@whiteboard/editor/input/features/selection/press'
import { createTransformBinding } from '@whiteboard/editor/input/features/transform'
import { createViewportBinding } from '@whiteboard/editor/input/features/viewport'
import { createEditorInputHost } from '@whiteboard/editor/input/host'
import { createEdgeHoverService } from '@whiteboard/editor/input/hover/edge'
import {
  composeEditorInputPreviewState
} from '@whiteboard/editor/session/preview/state'
import type { EditorInputPreviewState } from '@whiteboard/editor/session/preview/types'
import type { EditorStateRuntime } from '@whiteboard/editor/state-engine/runtime'
import type {
  EditorInputHost,
  EditorProjection
} from '@whiteboard/editor/types/editor'
import type { NodeTypeSupport } from '@whiteboard/editor/types/node'
import type { EditorWrite } from '@whiteboard/editor/write/types'

type SessionRead = {
  tool: {
    get: () => import('@whiteboard/editor/types/tool').Tool
    is: (type: import('@whiteboard/editor/types/tool').Tool['type'], value?: string) => boolean
  }
  draw: {
    get: () => import('@whiteboard/editor/session/draw/state').DrawState
  }
  space: {
    get: () => boolean
  }
  viewport: {
    get: () => import('@whiteboard/core/types').Viewport
    pointer: EditorStateRuntime['viewport']['read']['pointer']
    worldToScreen: EditorStateRuntime['viewport']['read']['worldToScreen']
    worldRect: EditorStateRuntime['viewport']['read']['worldRect']
    screenPoint: EditorStateRuntime['viewport']['input']['screenPoint']
    size: EditorStateRuntime['viewport']['input']['size']
  }
}

type LocalEditorSession = {
  state: {
    tool: EditorStateRuntime['stores']['tool']['store']
    draw: EditorStateRuntime['stores']['draw']['store']
    selection: EditorStateRuntime['stores']['selection']['store']
    edit: EditorStateRuntime['stores']['edit']['store']
  }
  interaction: {
    read: {
      mode: store.ReadStore<ReturnType<EditorStateRuntime['stores']['interaction']['store']['get']>['mode']>
      busy: store.ReadStore<boolean>
      chrome: store.ReadStore<boolean>
      hover: {
        get: () => ReturnType<EditorStateRuntime['stores']['interaction']['store']['get']>['hover']
        subscribe: (listener: () => void) => () => void
      }
      space: store.ReadStore<boolean>
    }
  }
  transient: {
    pointer: {
      get: () => import('@whiteboard/editor/types/input').PointerSample | null
      subscribe: (listener: () => void) => () => void
    }
    setPointer: (sample: import('@whiteboard/editor/types/input').PointerSample | null) => void
    gesture: {
      get: () => import('@whiteboard/editor/input/core/gesture').ActiveGesture | null
      subscribe: (listener: () => void) => () => void
    }
    setGesture: (gesture: import('@whiteboard/editor/input/core/gesture').ActiveGesture | null) => void
  }
  preview: {
    get: () => EditorInputPreviewState
    subscribe: (listener: () => void) => () => void
  }
  dispatch: EditorStateRuntime['dispatch']
  viewport: EditorStateRuntime['viewport']
}

export type EditorHostDeps = {
  engine: Engine
  document: DocumentFrame
  projection: EditorProjection
  sessionRead: SessionRead
  session: LocalEditorSession
  sceneDerived: EditorProjection['derived']['scene']
  layout: WhiteboardLayoutService
  write: EditorWrite
  tool: {
    set: (tool: import('@whiteboard/editor/types/tool').Tool) => void
    select: () => void
    draw: (mode: import('@whiteboard/editor/session/draw/model').DrawMode) => void
    edge: (template: import('@whiteboard/core/types').EdgeTemplate) => void
    insert: (template: import('@whiteboard/editor/types/tool').InsertTemplate) => void
    hand: () => void
  }
  nodeType: NodeTypeSupport
  snap: SnapRuntime
}

export type EditorInputRuntimeHost = EditorInputHost & {
  preview: {
    get: () => EditorInputPreviewState
    subscribe: (listener: () => void) => () => void
  }
}

const createSessionRead = (
  runtime: EditorStateRuntime
): SessionRead => ({
  tool: {
    get: runtime.stores.tool.store.get,
    is: (type, value) => {
      const tool = runtime.stores.tool.store.get()
      if (tool.type !== type) {
        return false
      }

      return value === undefined
        ? true
        : tool.type === 'draw'
          ? tool.mode === value
          : false
    }
  },
  draw: {
    get: runtime.stores.draw.store.get
  },
  space: {
    get: () => runtime.stores.interaction.store.get().space
  },
  viewport: {
    get: runtime.viewport.read.get,
    pointer: runtime.viewport.read.pointer,
    worldToScreen: runtime.viewport.read.worldToScreen,
    worldRect: runtime.viewport.read.worldRect,
    screenPoint: runtime.viewport.input.screenPoint,
    size: runtime.viewport.input.size
  }
})

const createLocalEditorSession = (
  runtime: EditorStateRuntime
): LocalEditorSession => {
  const gesture = store.createValueStore<import('@whiteboard/editor/input/core/gesture').ActiveGesture | null>(null)
  const pointer = store.createValueStore<import('@whiteboard/editor/types/input').PointerSample | null>(null)
  const mode = store.createDerivedStore({
    get: () => runtime.stores.interaction.store.get().mode,
    isEqual: (left, right) => left === right
  })
  const chrome = store.createDerivedStore({
    get: () => runtime.stores.interaction.store.get().chrome,
    isEqual: (left, right) => left === right
  })
  const space = store.createDerivedStore({
    get: () => runtime.stores.interaction.store.get().space,
    isEqual: (left, right) => left === right
  })
  const busy = store.createDerivedStore({
    get: () => runtime.stores.interaction.store.get().mode !== 'idle',
    isEqual: (left, right) => left === right
  })

  return {
    state: {
      tool: runtime.stores.tool.store,
      draw: runtime.stores.draw.store,
      selection: runtime.stores.selection.store,
      edit: runtime.stores.edit.store
    },
    interaction: {
      read: {
        mode,
        busy,
        chrome,
        hover: {
          get: () => runtime.stores.interaction.store.get().hover,
          subscribe: runtime.stores.interaction.store.subscribe
        },
        space
      }
    },
    transient: {
      pointer: {
        get: pointer.get,
        subscribe: pointer.subscribe
      },
      setPointer: (sample) => {
        pointer.set(sample ?? null)
      },
      gesture: {
        get: gesture.get,
        subscribe: gesture.subscribe
      },
      setGesture: (nextGesture) => {
        gesture.set(nextGesture)
      }
    },
    preview: {
      get: () => composeEditorInputPreviewState({
        base: runtime.stores.preview.store.get(),
        gesture: gesture.get(),
        hover: runtime.stores.interaction.store.get().hover
      }),
      subscribe: gesture.subscribe
    },
    dispatch: runtime.dispatch,
    viewport: runtime.viewport
  }
}

const createEditorSnapRuntime = (input: {
  engine: Engine
  projection: EditorProjection
  runtime: EditorStateRuntime
}) => createSnapRuntime({
  readZoom: () => input.runtime.viewport.read.get().zoom,
  node: {
    config: input.engine.config.node,
    query: input.projection.snap.candidates
  },
  edge: {
    config: input.engine.config.edge,
    query: input.projection.edges.connectCandidates
  }
})

export const createEditorHost = (input: {
  engine: Engine
  document: DocumentFrame
  projection: EditorProjection
  runtime: EditorStateRuntime
  layout: WhiteboardLayoutService
  write: EditorWrite
  tool: EditorHostDeps['tool']
  nodeType: NodeTypeSupport
}): EditorInputRuntimeHost => {
  const session = createLocalEditorSession(input.runtime)
  const sessionRead = createSessionRead(input.runtime)
  const snap = createEditorSnapRuntime({
    engine: input.engine,
    projection: input.projection,
    runtime: input.runtime
  })
  const deps: EditorHostDeps = {
    engine: input.engine,
    document: input.document,
    projection: input.projection,
    sessionRead,
    session,
    sceneDerived: input.projection.derived.scene,
    layout: input.layout,
    write: input.write,
    tool: input.tool,
    nodeType: input.nodeType,
    snap
  }

  const interaction = createInteractionRuntime({
    getViewport: () => ({
      screenPoint: input.runtime.viewport.input.screenPoint,
      size: input.runtime.viewport.input.size,
      panScreenBy: (deltaScreen) => {
        const next = input.runtime.viewport.resolve.panScreenBy(deltaScreen)
        if (next) {
          input.runtime.dispatch({
            type: 'viewport.set',
            viewport: next
          })
        }
      }
    }),
    getBindings: () => ([
      createViewportBinding(deps),
      createDrawBinding(deps),
      createEdgeBinding(deps),
      createTransformBinding(deps),
      createSelectionBinding(deps)
    ]),
    state: {
      readInteraction: () => ({
        mode: input.runtime.stores.interaction.store.get().mode,
        chrome: input.runtime.stores.interaction.store.get().chrome,
        space: input.runtime.stores.interaction.store.get().space,
        hover: input.runtime.stores.interaction.store.get().hover
      }),
      dispatch: input.runtime.dispatch,
      setGesture: session.transient.setGesture,
      getSpace: () => input.runtime.stores.interaction.store.get().space
    }
  })

  const edgeHover = createEdgeHoverService(
    {
      readTool: input.runtime.stores.tool.store.get,
      snap
    },
    {
      read: () => ({
        mode: input.runtime.stores.interaction.store.get().mode,
        chrome: input.runtime.stores.interaction.store.get().chrome,
        space: input.runtime.stores.interaction.store.get().space,
        hover: input.runtime.stores.interaction.store.get().hover
      }),
      dispatch: input.runtime.dispatch
    }
  )

  const host = createEditorInputHost({
    interaction,
    edgeHover,
    projection: input.projection,
    session
  })

  return Object.assign(host, {
    preview: session.preview
  })
}
