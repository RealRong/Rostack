import { store } from '@shared/core'
import {
  createEditorSceneRuntime,
  type InputDelta,
  type Read as EditorGraphQuery,
  type Result,
  type Snapshot
} from '@whiteboard/editor-scene'
import type { Engine } from '@whiteboard/engine'
import type { EditorLayout } from '@whiteboard/editor/layout/runtime'
import type {
  HoverState as EditorHoverState,
  HoverTarget
} from '@whiteboard/editor/input/hover/store'
import type { EditSession } from '@whiteboard/editor/session/edit'
import { isEdgeGuideEqual } from '@whiteboard/editor/session/preview/edge'
import type { EditorInputPreviewState } from '@whiteboard/editor/session/preview/types'
import type { EditorSession } from '@whiteboard/editor/session/runtime'
import {
  createDocumentInputDelta,
  createEditorGraphInput,
  createEmptyEditorGraphInputDelta,
  createTouchedIdDelta,
  hasEditorGraphInputDelta,
  mergeEditorGraphInputDelta,
  readChangedPreviewEdgeIds,
  readEditedEdgeIds,
  readEditedNodeIds,
  readPreviewEdgeIds,
  readPreviewMindmapIds,
  readPreviewNodeIds,
  takeEditorGraphInputDelta
} from './input'

export interface EditorSceneController {
  query: EditorGraphQuery
  current(): {
    snapshot: Snapshot
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

const isHoverTargetEqual = (
  left: HoverTarget | undefined,
  right: HoverTarget | undefined
): boolean => {
  if (left === right) {
    return true
  }
  if (!left || !right || left.kind !== right.kind) {
    return false
  }

  switch (left.kind) {
    case 'node':
      return right.kind === 'node' && left.nodeId === right.nodeId
    case 'edge':
      return right.kind === 'edge' && left.edgeId === right.edgeId
    case 'mindmap':
      return right.kind === 'mindmap' && left.mindmapId === right.mindmapId
    case 'group':
      return right.kind === 'group' && left.groupId === right.groupId
    case 'selection-box':
      return right.kind === 'selection-box'
  }
}

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
    editingEdge:
      mode === 'edge-drag'
      || mode === 'edge-label'
      || mode === 'edge-connect'
      || mode === 'edge-route'
  }
}

const isProjectionInteractionStateEqual = (
  left: ProjectionInteractionState,
  right: ProjectionInteractionState
): boolean => (
  left.chrome === right.chrome
  && left.editingEdge === right.editingEdge
)

const createSelectionDelta = (): InputDelta => {
  const delta = createEmptyEditorGraphInputDelta()
  delta.ui.selection = true
  return delta
}

const createToolDelta = (): InputDelta => {
  const delta = createEmptyEditorGraphInputDelta()
  delta.ui.tool = true
  delta.ui.overlay = true
  return delta
}

const createHoverDelta = (input: {
  previous: EditorHoverState
  next: EditorHoverState
}): InputDelta => {
  const delta = createEmptyEditorGraphInputDelta()
  if (!isHoverTargetEqual(input.previous.target, input.next.target)) {
    delta.ui.hover = true
  }
  return delta
}

const createEditDelta = (input: {
  previous: EditSession | null
  next: EditSession | null
}): InputDelta => {
  const delta = createEmptyEditorGraphInputDelta()
  const touchedNodeIds = unionIds(
    readEditedNodeIds(input.previous),
    readEditedNodeIds(input.next)
  )
  const touchedEdgeIds = unionIds(
    readEditedEdgeIds(input.previous),
    readEditedEdgeIds(input.next)
  )

  if (touchedNodeIds.size > 0) {
    delta.graph.nodes.edit = createTouchedIdDelta(touchedNodeIds)
    delta.graph.nodes.draft = createTouchedIdDelta(touchedNodeIds)
  }
  if (touchedEdgeIds.size > 0) {
    delta.graph.edges.edit = createTouchedIdDelta(touchedEdgeIds)
  }
  delta.ui.edit = true
  return delta
}

const createInteractionDelta = (input: {
  previous: ProjectionInteractionState
  next: ProjectionInteractionState
}): InputDelta => {
  const delta = createEmptyEditorGraphInputDelta()

  if (!isProjectionInteractionStateEqual(input.previous, input.next)) {
    delta.ui.overlay = true
  }

  return delta
}

const createPreviewDelta = (input: {
  snapshot: ReturnType<Engine['current']>['snapshot']
  previous: EditorInputPreviewState
  next: EditorInputPreviewState
}): InputDelta => {
  const delta = createEmptyEditorGraphInputDelta()
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
    delta.graph.nodes.preview = createTouchedIdDelta(touchedNodeIds)
  }
  if (touchedEdgeIds.size > 0) {
    delta.graph.edges.preview = createTouchedIdDelta(touchedEdgeIds)
  }
  if (touchedMindmapIds.size > 0) {
    delta.graph.mindmaps.preview = createTouchedIdDelta(touchedMindmapIds)
  }
  if (
    input.previous.selection.node.frameHoverId !== input.next.selection.node.frameHoverId
    || input.previous.edge.interaction !== input.next.edge.interaction
  ) {
    delta.ui.hover = true
  }
  if (!isEdgeGuideEqual(
    input.previous.edge.guide ?? {},
    input.next.edge.guide ?? {}
  )) {
    delta.ui.overlay = true
  }
  if (
    input.previous.selection.marquee !== input.next.selection.marquee
  ) {
    delta.ui.marquee = true
  }
  if (input.previous.selection.guides !== input.next.selection.guides) {
    delta.ui.guides = true
  }
  if (
    input.previous.draw.preview !== input.next.draw.preview
    || input.previous.draw.hidden !== input.next.draw.hidden
  ) {
    delta.ui.draw = true
  }

  return delta
}

const createBootstrapDelta = (input: {
  engine: ReturnType<Engine['current']>
  session: Pick<EditorSession, 'state' | 'interaction' | 'preview'>
}): InputDelta => {
  const delta = createEmptyEditorGraphInputDelta()
  delta.document = createDocumentInputDelta(input.engine.delta)
  delta.ui.tool = true
  delta.ui.selection = true
  delta.ui.hover = true
  delta.ui.marquee = true
  delta.ui.guides = true
  delta.ui.draw = true
  delta.ui.edit = true
  delta.ui.overlay = true

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
    delta.graph.nodes.edit = createTouchedIdDelta(editedNodeIds)
    delta.graph.nodes.draft = createTouchedIdDelta(editedNodeIds)
  }
  if (editedEdgeIds.size > 0) {
    delta.graph.edges.edit = createTouchedIdDelta(editedEdgeIds)
  }
  if (previewNodeIds.size > 0) {
    delta.graph.nodes.preview = createTouchedIdDelta(previewNodeIds)
  }
  if (previewEdgeIds.size > 0) {
    delta.graph.edges.preview = createTouchedIdDelta(previewEdgeIds)
  }
  if (previewMindmapIds.size > 0) {
    delta.graph.mindmaps.preview = createTouchedIdDelta(previewMindmapIds)
  }

  return delta
}

export const createSceneController = ({
  engine,
  session,
  layout
}: {
  engine: Engine
  session: Pick<EditorSession, 'state' | 'interaction' | 'preview'>
  layout: Pick<EditorLayout, 'draft' | 'measureText'>
}): EditorSceneController => {
  const runtime = createEditorSceneRuntime({
    measure: layout.measureText
  })
  let currentResult: Result | null = null
  const listeners = new Set<(result: Result) => void>()
  const state = {
    engine: engine.current(),
    previousDocumentSnapshot: null as ReturnType<Engine['current']>['snapshot'] | null,
    pending: createEmptyEditorGraphInputDelta(),
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
    mergeEditorGraphInputDelta(state.pending, delta)
    scheduleFlush()
  }

  const flush = () => {
    if (state.flushing) {
      return currentResult
    }

    state.flushing = true
    state.scheduled = false
    try {
      while (hasEditorGraphInputDelta(state.pending)) {
        const delta = takeEditorGraphInputDelta(state.pending)
        const result = runtime.update(createEditorGraphInput({
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
      if (hasEditorGraphInputDelta(state.pending)) {
        scheduleFlush()
      }
    }

    return currentResult
  }

  const unsubscribes = [
    engine.subscribe((publish) => {
      state.previousDocumentSnapshot = state.engine.snapshot
      state.engine = publish
      const delta = createEmptyEditorGraphInputDelta()
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
      if (delta.ui.hover) {
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
      if (delta.ui.overlay) {
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
      if (delta.ui.overlay) {
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
    query: runtime.query,
    current: () => ({
      snapshot: runtime.snapshot(),
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
