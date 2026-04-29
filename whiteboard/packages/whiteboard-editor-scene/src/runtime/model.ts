import {
  createProjection,
  type ProjectionContext,
  type ProjectionFamilyField,
  type ProjectionFamilyPatch,
  type ProjectionFamilySnapshot,
  type ProjectionPhaseTable,
  type ProjectionSurfaceTree,
  type ProjectionDirty,
  type ProjectionValueField,
  type Revision,
} from '@shared/projection'
import {
  entityDelta,
  idDelta
} from '@shared/delta'
import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type {
  Input,
  NodeCapabilityInput,
  SceneViewInput,
  EditorSceneLayout
} from '../contracts/editor'
import type {
  GraphDelta
} from '../contracts/delta'
import {
  createItemsDelta,
  renderChange,
  resetGraphDirty,
  uiChange,
  resetGraphDelta
} from '../contracts/delta'
import type {
  WorkingState
} from '../contracts/working'
import type {
  EdgeActiveView,
  EdgeLabelKey,
  EdgeStaticId,
  EdgeStaticView
} from '../contracts/render'
import type { SceneItemKey } from '../contracts/delta'
import { patchGraphState } from '../model/graph/patch'
import { patchDocumentState } from '../model/document/patch'
import { patchItemsState } from '../model/items/patch'
import { patchRenderState } from '../model/render/patch'
import { patchSpatial } from '../model/spatial/update'
import { patchUiState } from '../model/ui/patch'
import { createEditorSceneRead } from './read'
import { buildEditorSceneCapture } from './capture'
import { createWorking } from './state'

export type EditorScenePhaseName =
  | 'document'
  | 'graph'
  | 'spatial'
  | 'items'
  | 'ui'
  | 'render'

type EditorSceneProjectionDirty = ProjectionDirty & {
  previousDocument?: WorkingState['document']['snapshot']
}

type EditorSceneSurface = {
  document: {
    revision: ProjectionValueField<Input, WorkingState, EditorScenePhaseName, Revision>
    background: ProjectionValueField<Input, WorkingState, EditorScenePhaseName, WorkingState['document']['background']>
  }
  graph: {
    node: ProjectionFamilyField<Input, WorkingState, EditorScenePhaseName, NodeId, WorkingState['graph']['nodes'] extends Map<NodeId, infer TValue> ? TValue : never>
    edge: ProjectionFamilyField<Input, WorkingState, EditorScenePhaseName, EdgeId, WorkingState['graph']['edges'] extends Map<EdgeId, infer TValue> ? TValue : never>
    mindmap: ProjectionFamilyField<Input, WorkingState, EditorScenePhaseName, MindmapId, WorkingState['graph']['owners']['mindmaps'] extends Map<MindmapId, infer TValue> ? TValue : never>
    group: ProjectionFamilyField<Input, WorkingState, EditorScenePhaseName, GroupId, WorkingState['graph']['owners']['groups'] extends Map<GroupId, infer TValue> ? TValue : never>
    state: {
      node: ProjectionFamilyField<Input, WorkingState, EditorScenePhaseName, NodeId, WorkingState['graph']['state']['node'] extends Map<NodeId, infer TValue> ? TValue : never>
      edge: ProjectionFamilyField<Input, WorkingState, EditorScenePhaseName, EdgeId, WorkingState['graph']['state']['edge'] extends Map<EdgeId, infer TValue> ? TValue : never>
      chrome: ProjectionValueField<Input, WorkingState, EditorScenePhaseName, WorkingState['graph']['state']['chrome']>
    }
  }
  render: {
    node: ProjectionFamilyField<Input, WorkingState, EditorScenePhaseName, NodeId, WorkingState['render']['node'] extends Map<NodeId, infer TValue> ? TValue : never>
    edge: {
      statics: ProjectionFamilyField<Input, WorkingState, EditorScenePhaseName, EdgeStaticId, EdgeStaticView>
      active: ProjectionFamilyField<Input, WorkingState, EditorScenePhaseName, EdgeId, EdgeActiveView>
      labels: ProjectionFamilyField<Input, WorkingState, EditorScenePhaseName, EdgeLabelKey, WorkingState['render']['labels']['byId'] extends Map<EdgeLabelKey, infer TValue> ? TValue : never>
      masks: ProjectionFamilyField<Input, WorkingState, EditorScenePhaseName, EdgeId, WorkingState['render']['masks']['byId'] extends Map<EdgeId, infer TValue> ? TValue : never>
    }
    chrome: {
      scene: ProjectionValueField<Input, WorkingState, EditorScenePhaseName, WorkingState['render']['chrome']>
      edge: ProjectionValueField<Input, WorkingState, EditorScenePhaseName, WorkingState['render']['overlay']>
    }
  }
  items: ProjectionFamilyField<Input, WorkingState, EditorScenePhaseName, SceneItemKey, WorkingState['items']['byId'] extends ReadonlyMap<SceneItemKey, infer TValue> ? TValue : never>
}

const sameOrder = <T,>(
  left: readonly T[],
  right: readonly T[]
): boolean => (
  left.length === right.length
  && left.every((value, index) => Object.is(value, right[index]))
)

const createStableMapFamilyRead = <
  TKey extends string,
  TValue
>(
  select: (state: WorkingState) => ReadonlyMap<TKey, TValue>
): ((state: WorkingState) => ProjectionFamilySnapshot<TKey, TValue>) => {
  let previousMap: ReadonlyMap<TKey, TValue> | undefined
  let previousIds: readonly TKey[] = []

  return (state) => {
    const byId = select(state)
    if (byId === previousMap) {
      return {
        ids: previousIds,
        byId
      }
    }

    const nextIds = [...byId.keys()]
    if (!sameOrder(previousIds, nextIds)) {
      previousIds = nextIds
    }
    previousMap = byId

    return {
      ids: previousIds,
      byId
    }
  }
}

const createStableFamilyRead = <
  TKey extends string,
  TValue
>(
  select: (state: WorkingState) => {
    ids: readonly TKey[]
    byId: ReadonlyMap<TKey, TValue>
  }
): ((state: WorkingState) => ProjectionFamilySnapshot<TKey, TValue>) => {
  let previousIds: readonly TKey[] = []
  let previousById: ReadonlyMap<TKey, TValue> | undefined

  return (state) => {
    const snapshot = select(state)
    const ids = sameOrder(previousIds, snapshot.ids)
      ? previousIds
      : snapshot.ids

    previousIds = ids
    previousById = snapshot.byId

    return {
      ids,
      byId: previousById
    }
  }
}

const readProjectionDirty = (
  context: ProjectionContext<Input, WorkingState, EditorScenePhaseName>
): EditorSceneProjectionDirty => context.dirty as EditorSceneProjectionDirty

const toFamilyPatchOrSkip = <TKey extends string | number,>(
  patch: ProjectionFamilyPatch<TKey> | undefined
): ProjectionFamilyPatch<TKey> | 'skip' => patch ?? 'skip'

const resetGraphPhaseDelta = (
  state: WorkingState
) => {
  resetGraphDelta(state.delta.graph)
  resetGraphDirty(state.dirty.graph)
}

const resetItemsPhaseDelta = (
  state: WorkingState
) => {
  state.delta.items = createItemsDelta()
}

const resetUiPhaseDelta = (
  state: WorkingState
) => {
  state.delta.ui = uiChange.create()
}

const resetRenderPhaseDelta = (
  state: WorkingState
) => {
  state.delta.render = renderChange.create()
}

const toDocumentSnapshot = (
  input: Input['document']
) => ({
  revision: input.rev,
  document: input.doc
})

export const createEditorSceneProjection = (input: {
  layout?: EditorSceneLayout
  nodeCapability?: NodeCapabilityInput
  view: SceneViewInput
}) => createProjection({
  createState: () => createWorking({
    layout: input.layout
  }),
  createRead: (runtime) => createEditorSceneRead({
    revision: runtime.revision,
    state: runtime.state,
    items: () => runtime.state().items,
    spatial: () => runtime.state().spatial,
    nodeCapability: input.nodeCapability,
    view: input.view
  }),
  output: ({ state, revision }) => buildEditorSceneCapture(
    state,
    revision
  ),
  surface: {
    document: {
      revision: {
        kind: 'value' as const,
        read: (state) => state.revision.document
        ,
        changed: (ctx) => ctx.phase.document.changed
      },
      background: {
        kind: 'value' as const,
        read: (state) => state.document.background,
        changed: (ctx) => ctx.phase.document.changed
      }
    },
    graph: {
      node: {
        kind: 'family' as const,
        read: createStableMapFamilyRead((state) => state.graph.nodes),
        idsEqual: sameOrder,
        changed: ({ state }) => (
          idDelta.hasAny(state.delta.graph.entities.nodes)
        ),
        patch: ({ state }) => toFamilyPatchOrSkip(entityDelta.fromIdDelta({
          changes: state.delta.graph.entities.nodes,
          order: state.delta.graph.order
        }))
      },
      edge: {
        kind: 'family' as const,
        read: createStableMapFamilyRead((state) => state.graph.edges),
        idsEqual: sameOrder,
        changed: ({ state }) => (
          idDelta.hasAny(state.delta.graph.entities.edges)
        ),
        patch: ({ state }) => toFamilyPatchOrSkip(entityDelta.fromIdDelta({
          changes: state.delta.graph.entities.edges,
          order: state.delta.graph.order
        }))
      },
      mindmap: {
        kind: 'family' as const,
        read: createStableMapFamilyRead((state) => state.graph.owners.mindmaps),
        idsEqual: sameOrder,
        changed: ({ state }) => (
          idDelta.hasAny(state.delta.graph.entities.mindmaps)
        ),
        patch: ({ state }) => toFamilyPatchOrSkip(entityDelta.fromIdDelta({
          changes: state.delta.graph.entities.mindmaps,
          order: state.delta.graph.order
        }))
      },
      group: {
        kind: 'family' as const,
        read: createStableMapFamilyRead((state) => state.graph.owners.groups),
        idsEqual: sameOrder,
        changed: ({ state }) => (
          idDelta.hasAny(state.delta.graph.entities.groups)
        ),
        patch: ({ state }) => toFamilyPatchOrSkip(entityDelta.fromIdDelta({
          changes: state.delta.graph.entities.groups
        }))
      },
      state: {
        node: {
          kind: 'family' as const,
          read: createStableMapFamilyRead((state) => state.graph.state.node),
          idsEqual: sameOrder,
          changed: ({ state }) => idDelta.hasAny(state.delta.ui.node),
          patch: ({ state }) => toFamilyPatchOrSkip(entityDelta.fromIdDelta({
            changes: state.delta.ui.node
          }))
        },
        edge: {
          kind: 'family' as const,
          read: createStableMapFamilyRead((state) => state.graph.state.edge),
          idsEqual: sameOrder,
          changed: ({ state }) => idDelta.hasAny(state.delta.ui.edge),
          patch: ({ state }) => toFamilyPatchOrSkip(entityDelta.fromIdDelta({
            changes: state.delta.ui.edge
          }))
        },
        chrome: {
          kind: 'value' as const,
          read: (state) => state.graph.state.chrome,
          changed: ({ state }) => state.delta.ui.chrome
        }
      }
    },
    render: {
      node: {
        kind: 'family' as const,
        read: createStableMapFamilyRead((state) => state.render.node),
        idsEqual: sameOrder,
        changed: ({ state }) => idDelta.hasAny(state.delta.render.node),
        patch: ({ state }) => toFamilyPatchOrSkip(entityDelta.fromIdDelta({
          changes: state.delta.render.node
        }))
      },
      edge: {
        statics: {
          kind: 'family' as const,
          read: createStableFamilyRead((state) => state.render.statics),
          idsEqual: sameOrder,
          changed: ({ state }) => (
            idDelta.hasAny(state.delta.render.edge.statics)
            || state.delta.render.edge.staticsIds
          ),
          patch: ({ state }) => toFamilyPatchOrSkip(entityDelta.fromIdDelta({
            changes: state.delta.render.edge.statics,
            order: state.delta.render.edge.staticsIds
          }))
        },
        active: {
          kind: 'family' as const,
          read: createStableMapFamilyRead((state) => state.render.active),
          idsEqual: sameOrder,
          changed: ({ state }) => (
            idDelta.hasAny(state.delta.render.edge.active)
            || state.delta.render.edge.activeIds
          ),
          patch: ({ state }) => toFamilyPatchOrSkip(entityDelta.fromIdDelta({
            changes: state.delta.render.edge.active,
            order: state.delta.render.edge.activeIds
          }))
        },
        labels: {
          kind: 'family' as const,
          read: createStableFamilyRead((state) => state.render.labels),
          idsEqual: sameOrder,
          changed: ({ state }) => (
            idDelta.hasAny(state.delta.render.edge.labels)
            || state.delta.render.edge.labelsIds
          ),
          patch: ({ state }) => toFamilyPatchOrSkip(entityDelta.fromIdDelta({
            changes: state.delta.render.edge.labels,
            order: state.delta.render.edge.labelsIds
          }))
        },
        masks: {
          kind: 'family' as const,
          read: createStableFamilyRead((state) => state.render.masks),
          idsEqual: sameOrder,
          changed: ({ state }) => (
            idDelta.hasAny(state.delta.render.edge.masks)
            || state.delta.render.edge.masksIds
          ),
          patch: ({ state }) => toFamilyPatchOrSkip(entityDelta.fromIdDelta({
            changes: state.delta.render.edge.masks,
            order: state.delta.render.edge.masksIds
          }))
        }
      },
      chrome: {
        scene: {
          kind: 'value' as const,
          read: (state) => state.render.chrome,
          changed: ({ state }) => state.delta.render.chrome.scene
        },
        edge: {
          kind: 'value' as const,
          read: (state) => state.render.overlay,
          changed: ({ state }) => state.delta.render.chrome.edge
        }
      }
    },
    items: {
      kind: 'family' as const,
      read: createStableFamilyRead((state) => state.items),
      idsEqual: sameOrder,
      changed: ({ state }) => state.delta.items.change !== undefined,
      patch: ({ state }) => state.delta.items.change ?? 'skip'
    }
  } satisfies ProjectionSurfaceTree<
    Input,
    WorkingState,
    EditorScenePhaseName
  >,
  phases: {
    document: (ctx) => {
      const dirty = readProjectionDirty(ctx)
      const previousDocumentRevision = ctx.state.revision.document

      dirty.previousDocument = ctx.state.document.snapshot

      patchDocumentState({
        current: ctx.input,
        working: ctx.state,
        reset: ctx.dirty.reset
      })

      if (
        ctx.revision === 1
        || previousDocumentRevision !== ctx.input.document.rev
      ) {
        ctx.phase.document.changed = true
      }
    },
    graph: {
      after: ['document'],
      run: (ctx) => {
        const dirty = readProjectionDirty(ctx)

        const result = patchGraphState({
          revision: ctx.revision,
          current: ctx.input,
          working: ctx.state,
          reset: ctx.revision === 1,
          previousDocument: dirty.previousDocument
        })
        if (!result.ran) {
          resetGraphPhaseDelta(ctx.state)
          return
        }

        const graphChanged = (
          result.count > 0
          || ctx.revision === 1
          || ctx.state.delta.graph.order
        )
        if (graphChanged) {
          ctx.phase.graph.changed = true
        }
      }
    },
    spatial: {
      after: ['graph'],
      run: (ctx) => {
        const result = patchSpatial({
          revision: ctx.revision,
          graph: ctx.state.graph,
          snapshot: toDocumentSnapshot(ctx.input.document),
          graphDelta: ctx.state.delta.graph,
          state: ctx.state.spatial,
          reset: ctx.revision === 1,
          delta: ctx.state.delta.spatial
        })

        if (result.changed) {
          ctx.phase.spatial.changed = true
        }
      }
    },
    items: {
      after: ['graph'],
      run: (ctx) => {
        if (
          !(
            ctx.revision === 1
            || ctx.input.delta.graph.affects.items()
          )
        ) {
          resetItemsPhaseDelta(ctx.state)
          return
        }

        const result = patchItemsState({
          revision: ctx.revision,
          snapshot: toDocumentSnapshot(ctx.input.document),
          working: ctx.state,
          reset: ctx.revision === 1 || ctx.input.delta.reset === true
        })

        if (!result.changed) {
          return
        }

        ctx.phase.items.changed = true
      }
    },
    ui: {
      after: ['graph'],
      run: (ctx) => {
        const count = patchUiState({
          current: ctx.input,
          working: ctx.state,
          reset: ctx.revision === 1 || ctx.input.delta.reset === true
        })

        if (count > 0) {
          ctx.phase.ui.changed = true
        }
      }
    },
    render: {
      after: ['graph', 'items', 'ui'],
      run: (ctx) => {
        const count = patchRenderState({
          current: ctx.input,
          working: ctx.state,
          reset: ctx.revision === 1 || ctx.input.delta.reset === true
        })

        if (count > 0) {
          ctx.phase.render.changed = true
          return
        }

        resetRenderPhaseDelta(ctx.state)
      }
    }
  } satisfies ProjectionPhaseTable<
    Input,
    WorkingState,
    EditorScenePhaseName
  >
})
