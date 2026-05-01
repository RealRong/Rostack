import { createWhiteboardMutationDelta } from '@whiteboard/engine/mutation'
import type {
  NodeCapabilityInput,
  Runtime,
  SceneViewInput,
  EditorSceneLayout,
  Input,
  SceneUpdateInput,
  EditorProjectionSnapshot,
  EditorProjectionDelta,
  EditorSceneSnapshot,
  EditorSceneTouchedIds,
  EditorScenePreviewDelta,
  DragState,
  EditSession,
  PreviewInput
} from '../contracts/editor'
import type { State } from '../contracts/state'
import type { WorkingState } from '../contracts/working'
import { createEmptyEditorSceneRuntimeDelta } from '../contracts/facts'
import { createProjection } from './createProjection'
import { createScene } from './scene'
import { createRuntimeFacts } from './runtimeFacts'

const createEditorSceneStateReader = (input: {
  state: () => WorkingState
}): (() => State) => () => {
  const state = input.state()

  return {
    revision: state.revision,
    document: state.document,
    runtime: state.runtime,
    graph: state.graph,
    indexes: state.indexes,
    spatial: state.spatial,
    ui: state.ui,
    render: state.render,
    items: state.items
  }
}

const isEdgeInteractionMode = (
  mode: EditorSceneSnapshot['interaction']['mode']
): boolean => (
  mode === 'edge-drag'
  || mode === 'edge-label'
  || mode === 'edge-connect'
  || mode === 'edge-route'
)

const readEditedEdgeIds = (
  edit: EditSession | null
): ReadonlySet<string> => edit?.kind === 'edge-label'
  ? new Set([edit.edgeId])
  : new Set()

const readPreviewNodeIds = (
  preview: EditorSceneSnapshot['preview']
): ReadonlySet<string> => new Set(Object.keys(preview.nodes))

const readPreviewEdgeIds = (
  preview: EditorSceneSnapshot['preview']
): ReadonlySet<string> => new Set(Object.keys(preview.edges))

const readPreviewMindmapIds = (
  preview: EditorSceneSnapshot['preview']['mindmap']
): ReadonlySet<string> => {
  const ids = new Set<string>()

  if (preview?.rootMove) {
    ids.add(preview.rootMove.mindmapId)
  }
  if (preview?.subtreeMove) {
    ids.add(preview.subtreeMove.mindmapId)
  }

  return ids
}

const createTouchedIdDelta = <TId extends string>(
  ids: Iterable<TId>
) => ({
  added: new Set<TId>(),
  updated: new Set<TId>(ids),
  removed: new Set<TId>()
})

const readPreviewDelta = (
  value: EditorProjectionDelta['preview']
): EditorScenePreviewDelta | undefined => (
  value && value !== true
    ? value
    : undefined
)

const readHoverDelta = (
  value: EditorProjectionDelta['hover']
): EditorSceneTouchedIds | undefined => (
  value && value !== true
    ? value
    : undefined
)

const mergePreview = (
  base: PreviewInput,
  transient: PreviewInput
): PreviewInput => ({
  nodes: {
    ...base.nodes,
    ...transient.nodes
  },
  edges: {
    ...base.edges,
    ...transient.edges
  },
  ...(transient.edgeGuide ?? base.edgeGuide
    ? {
        edgeGuide: transient.edgeGuide ?? base.edgeGuide
      }
    : {}),
  draw: transient.draw ?? base.draw,
  selection: {
    ...(transient.selection.marquee ?? base.selection.marquee
      ? {
          marquee: transient.selection.marquee ?? base.selection.marquee
        }
      : {}),
    guides: transient.selection.guides.length > 0
      ? transient.selection.guides
      : base.selection.guides
  },
  mindmap: transient.mindmap
    ? {
        ...(base.mindmap ?? {}),
        ...transient.mindmap
      }
    : base.mindmap
})

const toEditorSceneSnapshot = (input: {
  snapshot: EditorProjectionSnapshot
  view: ReturnType<SceneViewInput>
}): EditorSceneSnapshot => ({
  tool: input.snapshot.state.tool,
  draw: input.snapshot.state.draw,
  selection: input.snapshot.state.selection,
  edit: input.snapshot.state.edit,
  interaction: {
    mode: input.snapshot.state.interaction.mode,
    chrome: input.snapshot.state.interaction.chrome,
    space: input.snapshot.state.interaction.space,
    hover: input.snapshot.overlay.hover
  },
  preview: mergePreview(
    input.snapshot.overlay.preview.base,
    input.snapshot.overlay.preview.transient
  ),
  viewport: input.snapshot.state.viewport,
  view: input.view
})

const createEditorRuntimeInputDelta = (input: {
  snapshot: EditorSceneSnapshot
  delta: EditorProjectionDelta
}) => {
  const delta = createEmptyEditorSceneRuntimeDelta()

  if (input.delta.tool) {
    delta.tool = true
  }
  if (input.delta.selection) {
    delta.selection = true
  }
  if (input.delta.edit) {
    delta.edit = true
    const touchedDraftEdgeIds = input.delta.edit === true
      ? [...readEditedEdgeIds(input.snapshot.edit)]
      : input.delta.edit.touchedDraftEdgeIds
    if (touchedDraftEdgeIds.length > 0) {
      delta.draft.edges = createTouchedIdDelta(touchedDraftEdgeIds)
    }
  }

  const interaction = input.delta.interaction
  if (interaction) {
    if (interaction.mode || interaction.chrome || interaction.space) {
      delta.interaction = true
    }
  }

  if (input.delta.hover) {
    delta.hover = true
    const hover = readHoverDelta(input.delta.hover)
    if (hover) {
      if (hover.touchedNodeIds.length > 0) {
        delta.preview.nodes = createTouchedIdDelta(hover.touchedNodeIds)
      }
      if (hover.touchedEdgeIds.length > 0) {
        delta.preview.edges = createTouchedIdDelta(hover.touchedEdgeIds)
      }
      if (hover.touchedMindmapIds.length > 0) {
        delta.preview.mindmaps = createTouchedIdDelta(hover.touchedMindmapIds)
      }
    }
  }

  const preview = readPreviewDelta(input.delta.preview)
  if (input.delta.preview) {
    const previewNodeIds = preview
      ? new Set(preview.touchedNodeIds)
      : readPreviewNodeIds(input.snapshot.preview)
    const previewEdgeIds = preview
      ? new Set(preview.touchedEdgeIds)
      : readPreviewEdgeIds(input.snapshot.preview)
    const previewMindmapIds = preview
      ? new Set(preview.touchedMindmapIds)
      : readPreviewMindmapIds(input.snapshot.preview.mindmap)

    if (previewNodeIds.size > 0) {
      delta.preview.nodes = createTouchedIdDelta(previewNodeIds)
    }
    if (previewEdgeIds.size > 0) {
      delta.preview.edges = createTouchedIdDelta(previewEdgeIds)
    }
    if (previewMindmapIds.size > 0) {
      delta.preview.mindmaps = createTouchedIdDelta(previewMindmapIds)
    }

    delta.preview.marquee = preview?.marquee ?? true
    delta.preview.guides = preview?.guides ?? true
    delta.preview.draw = preview?.draw ?? true
    delta.preview.edgeGuide = preview?.edgeGuide ?? true
  }

  return delta
}

const readDragState = (input: {
  document: SceneUpdateInput['document']['snapshot']
  editor: EditorSceneSnapshot
}): DragState => {
  const {
    interaction,
    selection,
    edit,
    preview
  } = input.editor

  switch (interaction.mode) {
    case 'node-drag':
      return {
        kind: 'selection-move',
        nodeIds: selection.nodeIds,
        edgeIds: selection.edgeIds
      }
    case 'marquee':
      return preview.selection.marquee
        ? {
            kind: 'selection-marquee',
            worldRect: preview.selection.marquee.worldRect,
            match: preview.selection.marquee.match
          }
        : {
            kind: 'idle'
          }
    case 'node-transform':
      return {
        kind: 'selection-transform',
        nodeIds: selection.nodeIds
      }
    case 'edge-label':
      return edit?.kind === 'edge-label'
        ? {
            kind: 'edge-label',
            edgeId: edit.edgeId,
            labelId: edit.labelId
          }
        : {
            kind: 'idle'
          }
    case 'edge-route':
      return edit?.kind === 'edge-label'
        ? {
            kind: 'edge-route',
            edgeId: edit.edgeId
          }
        : {
            kind: 'idle'
          }
    case 'draw':
      return {
        kind: 'draw'
      }
    case 'mindmap-drag': {
      const subtreeMove = preview.mindmap?.subtreeMove
      if (!subtreeMove) {
        return {
          kind: 'idle'
        }
      }

      return {
        kind: 'mindmap-drag',
        mindmapId: subtreeMove.mindmapId,
        nodeId: subtreeMove.nodeId
      }
    }
    default:
      return {
        kind: 'idle'
      }
  }
}

const toProjectionInput = (input: {
  update: SceneUpdateInput
  view: ReturnType<SceneViewInput>
}
): Input => {
  const editorSnapshot = toEditorSceneSnapshot({
    snapshot: input.update.editor.snapshot,
    view: input.view
  })
  const runtimeDelta = createEditorRuntimeInputDelta({
    snapshot: editorSnapshot,
    delta: input.update.editor.delta
  })
  const state: Input['runtime']['editor']['state'] = {
    edit: editorSnapshot.edit,
    draft: {
      edges: new Map()
    },
    preview: editorSnapshot.preview,
    tool: editorSnapshot.tool
  }
  const interaction: Input['runtime']['editor']['interaction'] = {
    selection: editorSnapshot.selection,
    hover: editorSnapshot.interaction.hover,
    drag: readDragState({
      document: input.update.document.snapshot,
      editor: editorSnapshot
    }),
    chrome: editorSnapshot.interaction.chrome,
    editingEdge: isEdgeInteractionMode(editorSnapshot.interaction.mode)
  }

  return {
    document: {
      rev: input.update.document.rev,
      doc: input.update.document.snapshot
    },
    runtime: {
      editor: {
        state,
        interaction,
        view: editorSnapshot.view,
        facts: createRuntimeFacts({
          state,
          interaction,
          delta: runtimeDelta
        }),
        delta: runtimeDelta
      }
    },
    delta: createWhiteboardMutationDelta(input.update.document.delta)
  }
}

export const createProjectionRuntime = (input: {
  layout?: EditorSceneLayout
  nodeCapability?: NodeCapabilityInput
  view: SceneViewInput
}): Runtime => {
  const runtime = createProjection(input)
  const scene = createScene({
    read: runtime.read,
    stores: runtime.stores
  })
  const state = createEditorSceneStateReader({
    state: runtime.state
  })

  return {
    scene,
    stores: runtime.stores,
    revision: runtime.revision,
    state,
    capture: runtime.capture,
    dispose: () => {
      scene.dispose()
    },
    update: (value) => {
      const result = runtime.update(toProjectionInput({
        update: value,
        view: input.view()
      }))
      return {
        revision: result.revision,
        trace: result.trace
      }
    },
    subscribe: (listener) => runtime.subscribe((result) => {
      listener({
        revision: result.revision,
        trace: result.trace
      })
    })
  }
}
