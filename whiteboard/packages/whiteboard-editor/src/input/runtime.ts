import type { Engine } from '@whiteboard/engine'
import type { WhiteboardLayoutService } from '@whiteboard/core/layout'
import type {
  EdgeGuidePreview
} from '@whiteboard/editor-scene'
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
  composeEditorPreviewState,
  EMPTY_PREVIEW_STATE,
  isPreviewEqual
} from '@whiteboard/editor/session/preview/state'
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
    tool: {
      get: () => import('@whiteboard/editor/types/tool').Tool
    }
    draw: {
      get: () => import('@whiteboard/editor/session/draw/state').DrawState
    }
    selection: {
      get: () => import('@whiteboard/core/selection').SelectionTarget
    }
    edit: {
      get: () => import('@whiteboard/editor/session/edit').EditSession
    }
  }
  interaction: {
    read: {
      mode: {
        get: () => import('@whiteboard/editor/input/core/types').InteractionMode
      }
      busy: {
        get: () => boolean
      }
      chrome: {
        get: () => boolean
      }
      hover: {
        get: () => import('@whiteboard/editor/input/hover/store').HoverState
      }
      space: {
        get: () => boolean
      }
    }
  }
  transient: {
    setPointer: (sample: import('@whiteboard/editor/types/input').PointerSample | null) => void
    gesture: {
      get: () => import('@whiteboard/editor/input/core/gesture').ActiveGesture | null
    }
    setGesture: (gesture: import('@whiteboard/editor/input/core/gesture').ActiveGesture | null) => void
    edgeGuide: {
      get: () => EdgeGuidePreview | undefined
    }
    setEdgeGuide: (edgeGuide: EdgeGuidePreview | undefined) => void
  }
  dispatch: EditorStateRuntime['dispatch']
  viewport: EditorStateRuntime['viewport']
}

export type EditorHostDeps = {
  engine: Engine
  document: import('@whiteboard/editor-scene').DocumentFrame
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

export type EditorInputRuntimeHost = EditorInputHost

const createSessionRead = (
  runtime: EditorStateRuntime
): SessionRead => ({
  tool: {
    get: () => runtime.snapshot().state.tool,
    is: (type, value) => {
      const tool = runtime.snapshot().state.tool
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
    get: () => runtime.snapshot().state.draw
  },
  space: {
    get: () => runtime.snapshot().state.interaction.space
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

const createLocalEditorSession = (input: {
  runtime: EditorStateRuntime
  document: Pick<import('@whiteboard/editor-scene').DocumentFrame, 'snapshot'>
}): LocalEditorSession => {
  let pointer: import('@whiteboard/editor/types/input').PointerSample | null = null
  let gesture: import('@whiteboard/editor/input/core/gesture').ActiveGesture | null = null
  let edgeGuide: EdgeGuidePreview | undefined

  const syncTransientPreview = () => {
    const nextPreview = composeEditorPreviewState({
      base: EMPTY_PREVIEW_STATE,
      gesture,
      hover: input.runtime.snapshot().overlay.hover,
      edgeGuide,
      readDocument: input.document.snapshot
    })
    const current = input.runtime.snapshot().overlay.preview.transient
    if (isPreviewEqual(current, nextPreview)) {
      return
    }

    input.runtime.dispatch({
      type: 'overlay.preview.transient.set',
      preview: nextPreview
    })
  }

  return {
    state: {
      tool: {
        get: () => input.runtime.snapshot().state.tool
      },
      draw: {
        get: () => input.runtime.snapshot().state.draw
      },
      selection: {
        get: () => input.runtime.snapshot().state.selection
      },
      edit: {
        get: () => input.runtime.snapshot().state.edit
      }
    },
    interaction: {
      read: {
        mode: {
          get: () => input.runtime.snapshot().state.interaction.mode
        },
        busy: {
          get: () => input.runtime.snapshot().state.interaction.mode !== 'idle'
        },
        chrome: {
          get: () => input.runtime.snapshot().state.interaction.chrome
        },
        hover: {
          get: () => input.runtime.snapshot().overlay.hover
        },
        space: {
          get: () => input.runtime.snapshot().state.interaction.space
        }
      }
    },
    transient: {
      setPointer: (sample) => {
        pointer = sample ?? null
        void pointer
      },
      gesture: {
        get: () => gesture
      },
      setGesture: (nextGesture) => {
        gesture = nextGesture
        syncTransientPreview()
      },
      edgeGuide: {
        get: () => edgeGuide
      },
      setEdgeGuide: (nextEdgeGuide) => {
        edgeGuide = nextEdgeGuide
        syncTransientPreview()
      }
    },
    dispatch: input.runtime.dispatch,
    viewport: input.runtime.viewport
  }
}

const createEditorSnapRuntime = (input: {
  engine: Engine
  projection: EditorProjection
  runtime: EditorStateRuntime
}) => createSnapRuntime({
  readZoom: () => input.runtime.snapshot().state.viewport.zoom,
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
  document: import('@whiteboard/editor-scene').DocumentFrame
  projection: EditorProjection
  runtime: EditorStateRuntime
  layout: WhiteboardLayoutService
  write: EditorWrite
  tool: EditorHostDeps['tool']
  nodeType: NodeTypeSupport
}): EditorInputRuntimeHost => {
  const session = createLocalEditorSession({
    runtime: input.runtime,
    document: input.document
  })
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
        mode: input.runtime.snapshot().state.interaction.mode,
        chrome: input.runtime.snapshot().state.interaction.chrome,
        space: input.runtime.snapshot().state.interaction.space,
        hover: input.runtime.snapshot().overlay.hover
      }),
      dispatch: input.runtime.dispatch,
      setGesture: session.transient.setGesture,
      getSpace: () => input.runtime.snapshot().state.interaction.space
    }
  })

  const edgeHover = createEdgeHoverService(
    {
      readTool: () => input.runtime.snapshot().state.tool,
      snap
    },
    {
      read: session.transient.edgeGuide.get,
      write: session.transient.setEdgeGuide
    }
  )

  return createEditorInputHost({
    interaction,
    edgeHover,
    projection: input.projection,
    session
  })
}
