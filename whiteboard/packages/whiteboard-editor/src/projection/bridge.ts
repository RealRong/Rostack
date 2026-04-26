import { store } from '@shared/core'
import {
  createChangeState,
  hasChangeState,
  mergeChangeState,
  takeChangeState
} from '@shared/projector/change'
import {
  createEditorSceneRuntime,
  type InputDelta,
  type Query as SceneQuery,
  type Result,
  type Runtime,
  type State
} from '@whiteboard/editor-scene'
import { sceneInputChangeSpec } from '@whiteboard/editor-scene/contracts/change'
import type { Engine } from '@whiteboard/engine'
import type { EditorLayout } from '@whiteboard/editor/layout/runtime'
import type {
  HoverState as EditorHoverState
} from '@whiteboard/editor/input/hover/store'
import {
  isHoverTargetEqual
} from '@whiteboard/editor/input/hover/store'
import type { EditSession } from '@whiteboard/editor/session/edit'
import { isEdgeGuideEqual } from '@whiteboard/editor/session/preview/edge'
import type { EditorInputPreviewState } from '@whiteboard/editor/session/preview/types'
import type { EditorSession } from '@whiteboard/editor/session/runtime'
import type { NodeTypeSupport } from '@whiteboard/editor/types/node'
import { resolveNodeEditorCapability } from '@whiteboard/editor/types/node'
import { isEdgeInteractionMode } from '@whiteboard/editor/input/interaction/mode'
import {
  createDocumentInputDelta,
  createSceneInput,
  createTouchedIdDelta,
  readChangedPreviewEdgeIds,
  readEditedEdgeIds,
  readEditedNodeIds,
  readPreviewEdgeIds,
  readPreviewMindmapIds,
  readPreviewNodeIds
} from './adapter'

export interface EditorSceneBridge {
  stores: Runtime['stores']
  query: SceneQuery
  current(): {
    revision: number
    state: State
    result: Result | null
  }
  mark(delta: InputDelta): void
  flush(): Result | null
  subscribe(listener: (result: Result) => void): () => void
  dispose(): void
}

const unionIds = <TId extends string>(
  ...values: readonly ReadonlySet<TId>[]
): ReadonlySet<TId> => new Set(
  values.flatMap((value) => [...value])
)

type ProjectionInteractionState = {
  chrome: boolean
  editingEdge: boolean
}

const readProjectionInteractionState = (
  session: Pick<EditorSession, 'interaction'>
): ProjectionInteractionState => {
  const mode = store.read(session.interaction.read.mode)

  return {
    chrome: store.read(session.interaction.read.chrome),
    editingEdge: isEdgeInteractionMode(mode)
  }
}

const isProjectionInteractionStateEqual = (
  left: ProjectionInteractionState,
  right: ProjectionInteractionState
): boolean => (
  left.chrome === right.chrome
  && left.editingEdge === right.editingEdge
)

const createInputDelta = (): InputDelta => createChangeState(
  sceneInputChangeSpec
)

const createSelectionDelta = (): InputDelta => {
  const delta = createInputDelta()
  delta.session.selection = true
  return delta
}

const createToolDelta = (): InputDelta => {
  const delta = createInputDelta()
  delta.session.tool = true
  return delta
}

const createHoverDelta = (input: {
  previous: EditorHoverState
  next: EditorHoverState
}): InputDelta => {
  const delta = createInputDelta()
  if (!isHoverTargetEqual(input.previous.target, input.next.target)) {
    delta.session.hover = true
  }
  return delta
}

const createEditDelta = (input: {
  previous: EditSession | null
  next: EditSession | null
}): InputDelta => {
  const delta = createInputDelta()
  const touchedNodeIds = unionIds(
    readEditedNodeIds(input.previous),
    readEditedNodeIds(input.next)
  )
  const touchedEdgeIds = unionIds(
    readEditedEdgeIds(input.previous),
    readEditedEdgeIds(input.next)
  )

  if (touchedNodeIds.size > 0) {
    delta.session.draft.nodes = createTouchedIdDelta(touchedNodeIds)
  }
  if (touchedEdgeIds.size > 0) {
    delta.session.draft.edges = createTouchedIdDelta(touchedEdgeIds)
  }
  delta.session.edit = true
  return delta
}

const createInteractionDelta = (input: {
  previous: ProjectionInteractionState
  next: ProjectionInteractionState
}): InputDelta => {
  const delta = createInputDelta()

  if (!isProjectionInteractionStateEqual(input.previous, input.next)) {
    delta.session.interaction = true
  }

  return delta
}

const createPreviewDelta = (input: {
  snapshot: ReturnType<Engine['current']>['snapshot']
  previous: EditorInputPreviewState
  next: EditorInputPreviewState
}): InputDelta => {
  const delta = createInputDelta()
  const touchedNodeIds = unionIds(
    readPreviewNodeIds(input.previous),
    readPreviewNodeIds(input.next)
  )
  const touchedEdgeIds = readChangedPreviewEdgeIds({
    previous: input.previous,
    next: input.next
  })
  const touchedMindmapIds = unionIds(
    readPreviewMindmapIds(input.snapshot, input.previous.mindmap.preview),
    readPreviewMindmapIds(input.snapshot, input.next.mindmap.preview)
  )

  if (touchedNodeIds.size > 0) {
    delta.session.preview.nodes = createTouchedIdDelta(touchedNodeIds)
  }
  if (touchedEdgeIds.size > 0) {
    delta.session.preview.edges = createTouchedIdDelta(touchedEdgeIds)
  }
  if (touchedMindmapIds.size > 0) {
    delta.session.preview.mindmaps = createTouchedIdDelta(touchedMindmapIds)
  }
  if (
    input.previous.selection.node.frameHoverId !== input.next.selection.node.frameHoverId
    || input.previous.selection.edge !== input.next.selection.edge
  ) {
    delta.session.hover = true
  }
  if (!isEdgeGuideEqual(
    input.previous.edge.guide ?? {},
    input.next.edge.guide ?? {}
  )) {
    delta.session.preview.edgeGuide = true
  }
  if (
    input.previous.selection.marquee !== input.next.selection.marquee
  ) {
    delta.session.preview.marquee = true
  }
  if (input.previous.selection.guides !== input.next.selection.guides) {
    delta.session.preview.guides = true
  }
  if (
    input.previous.draw.preview !== input.next.draw.preview
    || input.previous.draw.hidden !== input.next.draw.hidden
  ) {
    delta.session.preview.draw = true
  }

  return delta
}

const createBootstrapDelta = (input: {
  engine: ReturnType<Engine['current']>
  session: Pick<EditorSession, 'state' | 'interaction' | 'preview'>
}): InputDelta => {
  const delta = createInputDelta()
  delta.document = createDocumentInputDelta(input.engine.delta)
  delta.session.tool = true
  delta.session.selection = true
  delta.session.hover = true
  delta.session.edit = true
  delta.session.interaction = true
  delta.session.preview.marquee = true
  delta.session.preview.guides = true
  delta.session.preview.draw = true
  delta.session.preview.edgeGuide = true

  const edit = input.session.state.edit.get()
  const editedNodeIds = readEditedNodeIds(edit)
  const editedEdgeIds = readEditedEdgeIds(edit)
  const preview = input.session.preview.state.get()
  const previewNodeIds = readPreviewNodeIds(preview)
  const previewEdgeIds = readPreviewEdgeIds(preview)
  const previewMindmapIds = readPreviewMindmapIds(
    input.engine.snapshot,
    preview.mindmap.preview
  )

  if (editedNodeIds.size > 0) {
    delta.session.draft.nodes = createTouchedIdDelta(editedNodeIds)
  }
  if (editedEdgeIds.size > 0) {
    delta.session.draft.edges = createTouchedIdDelta(editedEdgeIds)
  }
  if (previewNodeIds.size > 0) {
    delta.session.preview.nodes = createTouchedIdDelta(previewNodeIds)
  }
  if (previewEdgeIds.size > 0) {
    delta.session.preview.edges = createTouchedIdDelta(previewEdgeIds)
  }
  if (previewMindmapIds.size > 0) {
    delta.session.preview.mindmaps = createTouchedIdDelta(previewMindmapIds)
  }

  return delta
}

export const createSceneBridge = ({
  engine,
  session,
  layout,
  nodeType
}: {
  engine: Engine
  session: Pick<EditorSession, 'state' | 'interaction' | 'preview' | 'viewport'>
  layout: Pick<EditorLayout, 'draft' | 'measureText'>
  nodeType: Pick<NodeTypeSupport, 'meta' | 'edit' | 'capability'>
}): EditorSceneBridge => {
  const runtime = createEditorSceneRuntime({
    measure: layout.measureText,
    nodeCapability: {
      meta: nodeType.meta,
      edit: nodeType.edit,
      capability: (node) => resolveNodeEditorCapability(node, nodeType)
    },
    document: {
      nodeSize: engine.config.nodeSize
    },
    view: () => {
      const viewport = session.viewport.read.get()
      return {
        zoom: viewport.zoom,
        center: viewport.center,
        worldRect: session.viewport.read.worldRect()
      }
    }
  })
  let currentResult: Result | null = null
  const listeners = new Set<(result: Result) => void>()
  const state = {
    engine: engine.current(),
    previousDocumentSnapshot: null as ReturnType<Engine['current']>['snapshot'] | null,
    pending: createInputDelta(),
    flushing: false,
    scheduled: false
  }

  let currentEdit = store.read(session.state.edit)
  let currentPreview = store.read(session.preview.state)
  let currentHover = store.read(session.interaction.read.hover)
  let currentInteraction = readProjectionInteractionState(session)

  const notify = (
    result: Result
  ) => {
    listeners.forEach((listener) => {
      listener(result)
    })
  }

  const scheduleFlush = () => {
    if (state.scheduled) {
      return
    }

    state.scheduled = true
    queueMicrotask(() => {
      flush()
    })
  }

  const mark = (
    delta: InputDelta
  ) => {
    mergeChangeState(sceneInputChangeSpec, state.pending, delta)
    scheduleFlush()
  }

  const flush = () => {
    if (state.flushing) {
      return currentResult
    }

    state.flushing = true
    state.scheduled = false
    try {
      while (hasChangeState(sceneInputChangeSpec, state.pending)) {
        const delta = takeChangeState(sceneInputChangeSpec, state.pending)
        const result = runtime.update(createSceneInput({
          previous: state.previousDocumentSnapshot,
          publish: state.engine,
          session,
          layout,
          delta
        }))
        currentResult = result
        notify(result)
      }
    } finally {
      state.flushing = false
      if (hasChangeState(sceneInputChangeSpec, state.pending)) {
        scheduleFlush()
      }
    }

    return currentResult
  }

  const unsubscribes = [
    engine.subscribe((publish) => {
      state.previousDocumentSnapshot = state.engine.snapshot
      state.engine = publish
      const delta = createInputDelta()
      delta.document = createDocumentInputDelta(publish.delta)
      mark(delta)
    }),
    session.state.tool.subscribe(() => {
      mark(createToolDelta())
    }),
    session.state.edit.subscribe(() => {
      const previousEdit = currentEdit
      currentEdit = store.read(session.state.edit)
      mark(createEditDelta({
        previous: previousEdit,
        next: currentEdit
      }))
    }),
    session.state.selection.subscribe(() => {
      mark(createSelectionDelta())
    }),
    session.preview.state.subscribe(() => {
      const previousPreview = currentPreview
      currentPreview = store.read(session.preview.state)
      mark(createPreviewDelta({
        snapshot: state.engine.snapshot,
        previous: previousPreview,
        next: currentPreview
      }))
    }),
    session.interaction.read.hover.subscribe(() => {
      const previousHover = currentHover
      currentHover = store.read(session.interaction.read.hover)
      const delta = createHoverDelta({
        previous: previousHover,
        next: currentHover
      })
      if (delta.session.hover) {
        mark(delta)
      }
    }),
    session.interaction.read.mode.subscribe(() => {
      const previousInteraction = currentInteraction
      currentInteraction = readProjectionInteractionState(session)
      const delta = createInteractionDelta({
        previous: previousInteraction,
        next: currentInteraction
      })
      if (delta.session.interaction) {
        mark(delta)
      }
    }),
    session.interaction.read.chrome.subscribe(() => {
      const previousInteraction = currentInteraction
      currentInteraction = readProjectionInteractionState(session)
      const delta = createInteractionDelta({
        previous: previousInteraction,
        next: currentInteraction
      })
      if (delta.session.interaction) {
        mark(delta)
      }
    })
  ]

  mark(createBootstrapDelta({
    engine: state.engine,
    session
  }))
  flush()

  return {
    stores: runtime.stores,
    query: runtime.query,
    current: () => ({
      revision: runtime.revision(),
      state: runtime.state(),
      result: currentResult
    }),
    mark,
    flush,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    dispose: () => {
      unsubscribes.forEach((unsubscribe) => {
        unsubscribe()
      })
      listeners.clear()
    }
  }
}
