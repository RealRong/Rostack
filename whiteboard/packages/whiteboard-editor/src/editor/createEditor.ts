import { equal } from '@shared/core'
import {
  normalizeMutationDelta,
  type MutationDelta
} from '@shared/mutation'
import type { HistoryPort } from '@shared/mutation'
import { isCheckpointProgram } from '@whiteboard/core/mutation'
import type { Viewport } from '@whiteboard/core/types'
import type { WhiteboardLayoutService } from '@whiteboard/core/layout'
import { createEditorActionsApi } from '@whiteboard/editor/action'
import {
  createEditorProjection,
  createEditorSceneFacade
} from '@whiteboard/editor/editor/projection'
import {
  createEditorStateStores,
  createEditorStateView
} from '@whiteboard/editor/editor/ui/state'
import { createSnapRuntime } from '@whiteboard/editor/input/core/snap'
import { createEditorInputHost } from '@whiteboard/editor/input/host'
import { createProjectionRuntime } from '@whiteboard/editor-scene'
import {
  DEFAULT_DRAW_STATE,
  type DrawState
} from '@whiteboard/editor/session/draw/state'
import { createEditorStateRuntime } from '@whiteboard/editor/state-engine/runtime'
import type { EditorCommand } from '@whiteboard/editor/state-engine/intents'
import type { EditorDispatchInput } from '@whiteboard/editor/state-engine/intents'
import {
  collectEditorCommitFlags,
  createBootstrapEditorDelta,
  createDocumentDrivenEditorDelta,
  createEditorDeltaFromCommitFlags,
  mergeEditorDeltas
} from '@whiteboard/editor/state-engine/delta'
import { createEditorTaskRuntime } from '@whiteboard/editor/tasks/runtime'
import type { Editor } from '@whiteboard/editor/types/editor'
import {
  DEFAULT_EDITOR_DEFAULTS,
  type EditorDefaults
} from '@whiteboard/editor/types/defaults'
import {
  createNodeTypeSupport,
  type NodeSpec
} from '@whiteboard/editor/types/node'
import type { Tool } from '@whiteboard/editor/types/tool'
import { createEditorWrite } from '@whiteboard/editor/write'
import type { IntentResult } from '@whiteboard/engine'
import type { Engine } from '@whiteboard/engine'

const EMPTY_DOCUMENT_DELTA = normalizeMutationDelta()
const BOOTSTRAP_DOCUMENT_DELTA = normalizeMutationDelta({
  reset: true
})

const reconcileEditorAfterDocumentCommit = (input: {
  selection: {
    nodeIds: readonly string[]
    edgeIds: readonly string[]
  }
  edit: import('@whiteboard/editor/session/edit').EditSession
  document: {
    node: (id: string) => unknown
    edge: (id: string) => unknown
  }
}): EditorCommand[] => {
  const nextNodeIds = input.selection.nodeIds.filter((id) => Boolean(input.document.node(id)))
  const nextEdgeIds = input.selection.edgeIds.filter((id) => Boolean(input.document.edge(id)))
  const commands: EditorCommand[] = []

  if (
    !equal.sameOrder(nextNodeIds, input.selection.nodeIds)
    || !equal.sameOrder(nextEdgeIds, input.selection.edgeIds)
  ) {
    commands.push({
      type: 'selection.set',
      selection: {
        nodeIds: nextNodeIds,
        edgeIds: nextEdgeIds
      }
    })
  }

  if (
    input.edit
    && (
      (input.edit.kind === 'node' && !input.document.node(input.edit.nodeId))
      || (input.edit.kind === 'edge-label' && !input.document.edge(input.edit.edgeId))
    )
  ) {
    commands.push({
      type: 'edit.set',
      edit: null
    })
  }

  return commands
}

const createResetEditorCommands = (): readonly EditorCommand[] => ([
  {
    type: 'edit.set',
    edit: null
  },
  {
    type: 'selection.set',
    selection: {
      nodeIds: [],
      edgeIds: []
    }
  },
  {
    type: 'interaction.set',
    interaction: {
      mode: 'idle',
      chrome: false,
      space: false
    }
  },
  {
    type: 'overlay.reset'
  }
])

export const createEditor = (input: {
  engine: Engine
  history: HistoryPort<IntentResult>
  initialTool: Tool
  initialDrawState?: DrawState
  initialViewport: Viewport
  nodes: NodeSpec
  services?: {
    layout: WhiteboardLayoutService
    defaults?: EditorDefaults
  }
}): Editor => {
  const layout = input.services?.layout
  if (!layout) {
    throw new Error('Whiteboard layout service is required.')
  }

  const defaults = input.services?.defaults ?? DEFAULT_EDITOR_DEFAULTS
  const nodeType = createNodeTypeSupport(input.nodes)
  const stateRuntime = createEditorStateRuntime({
    initialTool: input.initialTool,
    initialDrawState: input.initialDrawState ?? DEFAULT_DRAW_STATE,
    initialViewport: input.initialViewport
  })
  const tasks = createEditorTaskRuntime()
  const stateStores = createEditorStateStores(stateRuntime)
  const editorState = createEditorStateView({
    stores: stateStores,
    runtime: stateRuntime
  })

  let currentSnapshot = stateRuntime.snapshot()
  const sceneRuntime = createProjectionRuntime({
    layout,
    nodeCapability: {
      meta: nodeType.meta,
      edit: nodeType.edit,
      capability: nodeType.support
    },
    view: () => ({
      zoom: stateRuntime.viewport.get().zoom,
      center: stateRuntime.viewport.get().center,
      worldRect: stateRuntime.viewport.worldRect()
    })
  })

  sceneRuntime.update({
    document: {
      snapshot: input.engine.doc(),
      rev: input.engine.rev(),
      delta: BOOTSTRAP_DOCUMENT_DELTA
    },
    editor: {
      snapshot: currentSnapshot,
      delta: createBootstrapEditorDelta(currentSnapshot)
    }
  })

  const projection = createEditorProjection({
    scene: sceneRuntime.scene,
    state: editorState,
    nodeType,
    defaults: defaults.selection
  })
  const scene = createEditorSceneFacade({
    projection,
    state: editorState,
    capture: sceneRuntime.capture
  })
  const document = projection.document
  const snap = createSnapRuntime({
    readZoom: () => stateRuntime.snapshot().state.viewport.zoom,
    node: {
      config: input.engine.config.node,
      query: projection.snap.candidates
    },
    edge: {
      config: input.engine.config.edge,
      query: projection.edges.connectCandidates
    }
  })
  const writeRuntime = createEditorWrite({
    engine: input.engine,
    history: input.history,
    document,
    projection
  })

  const actions = createEditorActionsApi({
    document,
    projection,
    editor: {
      tool: {
        get: () => stateRuntime.snapshot().state.tool
      },
      draw: {
        get: () => stateRuntime.snapshot().state.draw
      },
      edit: {
        get: () => stateRuntime.snapshot().state.edit
      },
      selection: {
        get: () => stateRuntime.snapshot().state.selection
      },
      preview: {
        get: () => stateRuntime.snapshot().overlay.preview
      },
      dispatch: stateRuntime.dispatch,
      viewport: stateRuntime.viewport
    },
    tasks,
    write: writeRuntime,
    nodeType,
    defaults: defaults.templates
  })

  const runtime = {
    viewport: {
      get: stateRuntime.viewport.get,
      subscribe: stateRuntime.viewport.subscribe,
      pointer: stateRuntime.viewport.pointer,
      worldToScreen: stateRuntime.viewport.worldToScreen,
      worldRect: stateRuntime.viewport.worldRect,
      screenPoint: stateRuntime.viewport.screenPoint,
      size: stateRuntime.viewport.size,
      setRect: (rect: Parameters<typeof stateRuntime.viewport.setRect>[0]) => {
        stateRuntime.viewport.setRect(rect)

        const previous = currentSnapshot
        const next = stateRuntime.snapshot()
        currentSnapshot = next
        sceneRuntime.update({
          document: {
            snapshot: input.engine.doc(),
            rev: input.engine.rev(),
            delta: EMPTY_DOCUMENT_DELTA
          },
          editor: {
            snapshot: next,
            delta: createEditorDeltaFromCommitFlags({
              flags: {
                tool: false,
                draw: false,
                selection: false,
                edit: false,
                interaction: false,
                hover: false,
                preview: false,
                viewport: true
              },
              previous,
              next
            })
          }
        })
      },
      setLimits: (limits: Parameters<typeof stateRuntime.viewport.setLimits>[0]) => {
        stateRuntime.viewport.setLimits(limits)

        const previous = currentSnapshot
        const next = stateRuntime.snapshot()
        currentSnapshot = next
        sceneRuntime.update({
          document: {
            snapshot: input.engine.doc(),
            rev: input.engine.rev(),
            delta: EMPTY_DOCUMENT_DELTA
          },
          editor: {
            snapshot: next,
            delta: createEditorDeltaFromCommitFlags({
              flags: {
                tool: false,
                draw: false,
                selection: false,
                edit: false,
                interaction: false,
                hover: false,
                preview: false,
                viewport: true
              },
              previous,
              next
            })
          }
        })
      }
    },
    config: input.engine.config,
    nodeType,
    snap
  }

  const dispatch: Editor['dispatch'] = (command) => {
    stateRuntime.dispatch(command as EditorDispatchInput)
  }

  const editorBase = {
    scene,
    document,
    actions,
    write: writeRuntime,
    read: stateRuntime.snapshot,
    runtime,
    dispatch
  }
  const host = createEditorInputHost({
    editor: {
      ...editorBase,
      input: null as never,
      dispose: () => {}
    },
    layout
  })

  let suppressEditorCommitProjection = false
  let suppressedCommitDeltas: MutationDelta[] = []

  const unsubscribeEditorCommits = stateRuntime.commits.subscribe((commit) => {
    if (suppressEditorCommitProjection) {
      suppressedCommitDeltas.push(commit.delta)
      return
    }

    const previous = currentSnapshot
    const next = stateRuntime.snapshot()
    currentSnapshot = next

    sceneRuntime.update({
      document: {
        snapshot: input.engine.doc(),
        rev: input.engine.rev(),
        delta: EMPTY_DOCUMENT_DELTA
      },
      editor: {
        snapshot: next,
        delta: createEditorDeltaFromCommitFlags({
          flags: collectEditorCommitFlags([commit.delta]),
          previous,
          next
        })
      }
    })
  })

  const unsubscribeEngineCommits = input.engine.commits.subscribe((commit) => {
    const previous = currentSnapshot
    suppressEditorCommitProjection = true
    suppressedCommitDeltas = []

    if (commit.kind === 'replace' || isCheckpointProgram(commit.authored)) {
      host.cancel()
      stateRuntime.dispatch(createResetEditorCommands())
    } else {
      const editorSnapshot = stateRuntime.snapshot()
      const commands = reconcileEditorAfterDocumentCommit({
        selection: editorSnapshot.state.selection,
        edit: editorSnapshot.state.edit,
        document
      })
      if (commands.length > 0) {
        stateRuntime.dispatch(commands)
      }
    }

    suppressEditorCommitProjection = false

    const next = stateRuntime.snapshot()
    currentSnapshot = next
    const editorDelta = mergeEditorDeltas(
      createEditorDeltaFromCommitFlags({
        flags: collectEditorCommitFlags(suppressedCommitDeltas),
        previous,
        next
      }),
      createDocumentDrivenEditorDelta({
        previous,
        next
      })
    )

    sceneRuntime.update({
      document: {
        snapshot: commit.document,
        rev: commit.rev,
        delta: commit.delta
      },
      editor: {
        snapshot: next,
        delta: editorDelta
      }
    })
  })

  return {
    ...editorBase,
    input: host,
    dispose: () => {
      unsubscribeEngineCommits()
      unsubscribeEditorCommits()
      tasks.dispose()
      host.cancel()
      sceneRuntime.dispose()
      stateRuntime.dispose()
    }
  }
}
