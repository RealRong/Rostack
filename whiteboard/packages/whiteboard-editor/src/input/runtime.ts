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
  isPreviewEqual,
  readPersistentPreviewState
} from '@whiteboard/editor/preview/state'
import type { EditorStateRuntime } from '@whiteboard/editor/state-engine/runtime'
import type {
  EditorInputHost,
  EditorProjection
} from '@whiteboard/editor/types/editor'
import type { NodeTypeSupport } from '@whiteboard/editor/types/node'
import type { EditorWrite } from '@whiteboard/editor/write/types'

type EditorRead = {
  tool: {
    get: () => import('@whiteboard/editor/types/tool').Tool
    is: (type: import('@whiteboard/editor/types/tool').Tool['type'], value?: string) => boolean
  }
  draw: {
    get: () => import('@whiteboard/editor/session/draw/state').DrawState
  }
  selection: {
    get: () => import('@whiteboard/core/selection').SelectionTarget
  }
  interaction: {
    busy: {
      get: () => boolean
    }
    hover: {
      get: () => import('@whiteboard/editor/input/hover/store').HoverState
    }
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

type LocalEditorRuntime = {
  transient: {
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
  read: EditorRead
  runtime: LocalEditorRuntime
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

const createEditorRead = (
  runtime: EditorStateRuntime
): EditorRead => ({
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
  selection: {
    get: () => runtime.snapshot().state.selection
  },
  interaction: {
    busy: {
      get: () => runtime.snapshot().state.interaction.mode !== 'idle'
    },
    hover: {
      get: () => runtime.snapshot().overlay.hover
    }
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

const createLocalEditorRuntime = (input: {
  runtime: EditorStateRuntime
  document: Pick<import('@whiteboard/editor-scene').DocumentFrame, 'snapshot'>
}): LocalEditorRuntime => {
  let gesture: import('@whiteboard/editor/input/core/gesture').ActiveGesture | null = null
  let edgeGuide: EdgeGuidePreview | undefined

  const syncTransientPreview = () => {
    const basePreview = readPersistentPreviewState(
      input.runtime.snapshot().overlay.preview
    )
    const nextPreview = composeEditorPreviewState({
      base: basePreview,
      gesture,
      edgeGuide,
      readDocument: input.document.snapshot
    })
    const current = input.runtime.snapshot().overlay.preview
    if (isPreviewEqual(current, nextPreview)) {
      return
    }

    input.runtime.dispatch({
      type: 'overlay.preview.set',
      preview: nextPreview
    })
  }

  return {
    transient: {
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
  const runtime = createLocalEditorRuntime({
    runtime: input.runtime,
    document: input.document
  })
  const read = createEditorRead(input.runtime)
  const snap = createEditorSnapRuntime({
    engine: input.engine,
    projection: input.projection,
    runtime: input.runtime
  })
  const deps: EditorHostDeps = {
    engine: input.engine,
    document: input.document,
    projection: input.projection,
    read,
    runtime,
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
      setGesture: runtime.transient.setGesture,
      getSpace: () => input.runtime.snapshot().state.interaction.space
    }
  })

  const edgeHover = createEdgeHoverService(
    {
      readTool: () => input.runtime.snapshot().state.tool,
      snap
    },
    {
      read: runtime.transient.edgeGuide.get,
      write: runtime.transient.setEdgeGuide
    }
  )

  return createEditorInputHost({
    interaction,
    edgeHover,
    projection: input.projection,
    read,
    runtime
  })
}
