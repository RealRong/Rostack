import { createWhiteboardMutationDelta } from '@whiteboard/engine/mutation'
import type {
  NodeCapabilityInput,
  Runtime,
  SceneViewInput,
  EditorSceneLayout,
  Input,
  SceneUpdateInput,
  EditorSceneSnapshot,
  EditorSceneDelta,
  EditorSceneTouchedIds,
  EditorScenePreviewDelta,
  DragState,
  EditSession
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
): ReadonlySet<string> => new Set(preview.nodes.keys())

const readPreviewEdgeIds = (
  preview: EditorSceneSnapshot['preview']
): ReadonlySet<string> => new Set(preview.edges.keys())

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
  value: EditorSceneDelta['preview']
): EditorScenePreviewDelta | undefined => (
  value && value !== true
    ? value
    : undefined
)

const readHoverDelta = (
  value: NonNullable<EditorSceneDelta['interaction']>['hover']
): EditorSceneTouchedIds | undefined => (
  value && value !== true
    ? value
    : undefined
)

const createEditorRuntimeInputDelta = (input: {
  snapshot: EditorSceneSnapshot
  delta: EditorSceneDelta
}) => {
  const delta = createEmptyEditorSceneRuntimeDelta()

  if (input.delta.tool) {
    delta.session.tool = true
  }
  if (input.delta.selection) {
    delta.session.selection = true
  }
  if (input.delta.edit) {
    delta.session.edit = true
    const touchedDraftEdgeIds = input.delta.edit === true
      ? [...readEditedEdgeIds(input.snapshot.edit)]
      : input.delta.edit.touchedDraftEdgeIds
    if (touchedDraftEdgeIds.length > 0) {
      delta.session.draft.edges = createTouchedIdDelta(touchedDraftEdgeIds)
    }
  }

  const interaction = input.delta.interaction
  if (interaction) {
    if (interaction.mode || interaction.chrome || interaction.space || interaction.hover) {
      delta.session.interaction = true
    }
    if (interaction.hover) {
      delta.session.hover = true
      const hover = readHoverDelta(interaction.hover)
      if (hover) {
        if (hover.touchedNodeIds.length > 0) {
          delta.session.preview.nodes = createTouchedIdDelta(hover.touchedNodeIds)
        }
        if (hover.touchedEdgeIds.length > 0) {
          delta.session.preview.edges = createTouchedIdDelta(hover.touchedEdgeIds)
        }
        if (hover.touchedMindmapIds.length > 0) {
          delta.session.preview.mindmaps = createTouchedIdDelta(hover.touchedMindmapIds)
        }
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
      delta.session.preview.nodes = createTouchedIdDelta(previewNodeIds)
    }
    if (previewEdgeIds.size > 0) {
      delta.session.preview.edges = createTouchedIdDelta(previewEdgeIds)
    }
    if (previewMindmapIds.size > 0) {
      delta.session.preview.mindmaps = createTouchedIdDelta(previewMindmapIds)
    }

    delta.session.preview.marquee = preview?.marquee ?? true
    delta.session.preview.guides = preview?.guides ?? true
    delta.session.preview.draw = preview?.draw ?? true
    delta.session.preview.edgeGuide = preview?.edgeGuide ?? true
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

const toProjectionInput = (
  input: SceneUpdateInput
): Input => {
  const runtimeDelta = createEditorRuntimeInputDelta({
    snapshot: input.editor.snapshot,
    delta: input.editor.delta
  })
  const session: Input['runtime']['session'] = {
    edit: input.editor.snapshot.edit,
    draft: {
      edges: new Map()
    },
    preview: input.editor.snapshot.preview,
    tool: input.editor.snapshot.tool
  }
  const interaction: Input['runtime']['interaction'] = {
    selection: input.editor.snapshot.selection,
    hover: input.editor.snapshot.interaction.hover,
    drag: readDragState({
      document: input.document.snapshot,
      editor: input.editor.snapshot
    }),
    chrome: input.editor.snapshot.interaction.chrome,
    editingEdge: isEdgeInteractionMode(input.editor.snapshot.interaction.mode)
  }

  return {
    document: {
      rev: input.document.rev,
      doc: input.document.snapshot
    },
    runtime: {
      session,
      interaction,
      view: input.editor.snapshot.view,
      facts: createRuntimeFacts({
        session,
        interaction,
        delta: runtimeDelta
      }),
      delta: runtimeDelta
    },
    delta: createWhiteboardMutationDelta(input.document.delta)
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
      const result = runtime.update(toProjectionInput(value))
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
