import {
  createProjection,
  type ProjectionContext,
  type ProjectionFamilyChange,
  type ProjectionFamilySnapshot,
  type ProjectionPhaseTable,
  type ProjectionDirty,
  type ProjectionStoreTree,
  type Revision,
} from '@shared/projection'
import {
  type EntityDelta,
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
  GraphDelta,
  DocumentDelta
} from '../contracts/delta'
import {
  createItemsDelta,
  renderChange,
  uiChange,
  resetDocumentDelta,
  resetGraphDelta
} from '../contracts/delta'
import type {
  WorkingState
} from '../contracts/working'
import {
  executionScopeHasAny
} from '../contracts/execution'
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
import { resetSpatialDelta } from '../model/spatial/update'
import { patchUiState } from '../model/ui/patch'
import { createEditorSceneRead } from './read'
import { buildEditorSceneCapture } from './capture'
import { createWhiteboardSceneExecution } from './execution'
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

type EditorSceneStores = {
  document: {
    revision: {
      kind: 'value'
      read(state: WorkingState): Revision
      change(state: WorkingState): {
        value: Revision
      } | 'skip'
    }
    background: {
      kind: 'value'
      read(state: WorkingState): WorkingState['document']['background']
      change(state: WorkingState): {
        value: WorkingState['document']['background']
      } | 'skip'
    }
  }
  graph: {
    node: {
      kind: 'family'
      read(state: WorkingState): ProjectionFamilySnapshot<NodeId, WorkingState['graph']['nodes'] extends Map<NodeId, infer TValue> ? TValue : never>
      change(state: WorkingState): ProjectionFamilyChange<NodeId, WorkingState['graph']['nodes'] extends Map<NodeId, infer TValue> ? TValue : never>
      idsEqual(left: readonly NodeId[], right: readonly NodeId[]): boolean
    }
    edge: {
      kind: 'family'
      read(state: WorkingState): ProjectionFamilySnapshot<EdgeId, WorkingState['graph']['edges'] extends Map<EdgeId, infer TValue> ? TValue : never>
      change(state: WorkingState): ProjectionFamilyChange<EdgeId, WorkingState['graph']['edges'] extends Map<EdgeId, infer TValue> ? TValue : never>
      idsEqual(left: readonly EdgeId[], right: readonly EdgeId[]): boolean
    }
    mindmap: {
      kind: 'family'
      read(state: WorkingState): ProjectionFamilySnapshot<MindmapId, WorkingState['graph']['owners']['mindmaps'] extends Map<MindmapId, infer TValue> ? TValue : never>
      change(state: WorkingState): ProjectionFamilyChange<MindmapId, WorkingState['graph']['owners']['mindmaps'] extends Map<MindmapId, infer TValue> ? TValue : never>
      idsEqual(left: readonly MindmapId[], right: readonly MindmapId[]): boolean
    }
    group: {
      kind: 'family'
      read(state: WorkingState): ProjectionFamilySnapshot<GroupId, WorkingState['graph']['owners']['groups'] extends Map<GroupId, infer TValue> ? TValue : never>
      change(state: WorkingState): ProjectionFamilyChange<GroupId, WorkingState['graph']['owners']['groups'] extends Map<GroupId, infer TValue> ? TValue : never>
      idsEqual(left: readonly GroupId[], right: readonly GroupId[]): boolean
    }
    state: {
      node: {
        kind: 'family'
        read(state: WorkingState): ProjectionFamilySnapshot<NodeId, WorkingState['graph']['state']['node'] extends Map<NodeId, infer TValue> ? TValue : never>
        change(state: WorkingState): ProjectionFamilyChange<NodeId, WorkingState['graph']['state']['node'] extends Map<NodeId, infer TValue> ? TValue : never>
        idsEqual(left: readonly NodeId[], right: readonly NodeId[]): boolean
      }
      edge: {
        kind: 'family'
        read(state: WorkingState): ProjectionFamilySnapshot<EdgeId, WorkingState['graph']['state']['edge'] extends Map<EdgeId, infer TValue> ? TValue : never>
        change(state: WorkingState): ProjectionFamilyChange<EdgeId, WorkingState['graph']['state']['edge'] extends Map<EdgeId, infer TValue> ? TValue : never>
        idsEqual(left: readonly EdgeId[], right: readonly EdgeId[]): boolean
      }
      chrome: {
        kind: 'value'
        read(state: WorkingState): WorkingState['graph']['state']['chrome']
        change(state: WorkingState): {
          value: WorkingState['graph']['state']['chrome']
        } | 'skip'
      }
    }
  }
  render: {
    node: {
      kind: 'family'
      read(state: WorkingState): ProjectionFamilySnapshot<NodeId, WorkingState['render']['node'] extends Map<NodeId, infer TValue> ? TValue : never>
      change(state: WorkingState): ProjectionFamilyChange<NodeId, WorkingState['render']['node'] extends Map<NodeId, infer TValue> ? TValue : never>
      idsEqual(left: readonly NodeId[], right: readonly NodeId[]): boolean
    }
    edge: {
      statics: {
        kind: 'family'
        read(state: WorkingState): ProjectionFamilySnapshot<EdgeStaticId, EdgeStaticView>
        change(state: WorkingState): ProjectionFamilyChange<EdgeStaticId, EdgeStaticView>
        idsEqual(left: readonly EdgeStaticId[], right: readonly EdgeStaticId[]): boolean
      }
      active: {
        kind: 'family'
        read(state: WorkingState): ProjectionFamilySnapshot<EdgeId, EdgeActiveView>
        change(state: WorkingState): ProjectionFamilyChange<EdgeId, EdgeActiveView>
        idsEqual(left: readonly EdgeId[], right: readonly EdgeId[]): boolean
      }
      labels: {
        kind: 'family'
        read(state: WorkingState): ProjectionFamilySnapshot<EdgeLabelKey, WorkingState['render']['labels']['byId'] extends Map<EdgeLabelKey, infer TValue> ? TValue : never>
        change(state: WorkingState): ProjectionFamilyChange<EdgeLabelKey, WorkingState['render']['labels']['byId'] extends Map<EdgeLabelKey, infer TValue> ? TValue : never>
        idsEqual(left: readonly EdgeLabelKey[], right: readonly EdgeLabelKey[]): boolean
      }
      masks: {
        kind: 'family'
        read(state: WorkingState): ProjectionFamilySnapshot<EdgeId, WorkingState['render']['masks']['byId'] extends Map<EdgeId, infer TValue> ? TValue : never>
        change(state: WorkingState): ProjectionFamilyChange<EdgeId, WorkingState['render']['masks']['byId'] extends Map<EdgeId, infer TValue> ? TValue : never>
        idsEqual(left: readonly EdgeId[], right: readonly EdgeId[]): boolean
      }
    }
    chrome: {
      scene: {
        kind: 'value'
        read(state: WorkingState): WorkingState['render']['chrome']
        change(state: WorkingState): {
          value: WorkingState['render']['chrome']
        } | 'skip'
      }
      edge: {
        kind: 'value'
        read(state: WorkingState): WorkingState['render']['overlay']
        change(state: WorkingState): {
          value: WorkingState['render']['overlay']
        } | 'skip'
      }
    }
  }
  items: {
    kind: 'family'
    read(state: WorkingState): ProjectionFamilySnapshot<SceneItemKey, WorkingState['items']['byId'] extends ReadonlyMap<SceneItemKey, infer TValue> ? TValue : never>
    change(state: WorkingState): ProjectionFamilyChange<SceneItemKey, WorkingState['items']['byId'] extends ReadonlyMap<SceneItemKey, infer TValue> ? TValue : never>
    idsEqual(left: readonly SceneItemKey[], right: readonly SceneItemKey[]): boolean
  }
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

const toValueChange = <TValue,>(
  changed: boolean,
  value: TValue
): {
  value: TValue
} | 'skip' => changed
  ? {
      value
    }
  : 'skip'

const toFamilyChange = <TKey extends string | number, TValue>(input: {
  snapshot: ProjectionFamilySnapshot<TKey, TValue>
  delta?: EntityDelta<TKey>
}): ProjectionFamilyChange<TKey, TValue> => {
  const delta = input.delta
  if (!delta) {
    return 'skip'
  }

  const set = delta.set?.map((key) => {
    const value = input.snapshot.byId.get(key)
    if (value === undefined) {
      throw new Error(`Projection family change set key ${String(key)} is missing from snapshot.`)
    }

    return [key, value] as const
  })

  return {
    ...(delta.order
      ? {
          ids: input.snapshot.ids
        }
      : {}),
    ...(set?.length
      ? {
          set
        }
      : {}),
    ...(delta.remove?.length
      ? {
          remove: delta.remove
        }
      : {})
  }
}

const resetGraphPhaseDelta = (
  state: WorkingState
) => {
  resetGraphDelta(state.delta.graph)
}

const resetDocumentPhaseDelta = (
  state: WorkingState
) => {
  resetDocumentDelta(state.delta.document)
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

const collectItemChangeScope = (
  state: WorkingState
): WorkingState['execution']['change']['items'] => {
  const change = state.delta.items.change
  if (!change) {
    return new Set<SceneItemKey>()
  }

  return new Set<SceneItemKey>([
    ...(change.set ?? []),
    ...(change.remove ?? [])
  ])
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
  capture: ({ state, revision }) => buildEditorSceneCapture(
    state,
    revision
  ),
  stores: {
    document: {
      revision: {
        kind: 'value' as const,
        read: (state) => state.revision.document,
        change: (state) => toValueChange(
          state.delta.document.revision,
          state.revision.document
        )
      },
      background: {
        kind: 'value' as const,
        read: (state) => state.document.background,
        change: (state) => toValueChange(
          state.delta.document.background,
          state.document.background
        )
      }
    },
    graph: {
      node: {
        kind: 'family' as const,
        read: createStableMapFamilyRead((state) => state.graph.nodes),
        idsEqual: sameOrder,
        change: (state) => toFamilyChange({
          snapshot: createStableMapFamilyRead((current) => current.graph.nodes)(state),
          delta: idDelta.hasAny(state.delta.graph.entities.nodes)
            ? {
                ...(state.delta.graph.order
                  ? {
                      order: true as const
                    }
                  : {}),
                set: [
                  ...state.delta.graph.entities.nodes.added,
                  ...state.delta.graph.entities.nodes.updated
                ],
                remove: [...state.delta.graph.entities.nodes.removed]
              }
            : undefined
        })
      },
      edge: {
        kind: 'family' as const,
        read: createStableMapFamilyRead((state) => state.graph.edges),
        idsEqual: sameOrder,
        change: (state) => toFamilyChange({
          snapshot: createStableMapFamilyRead((current) => current.graph.edges)(state),
          delta: idDelta.hasAny(state.delta.graph.entities.edges)
            ? {
                ...(state.delta.graph.order
                  ? {
                      order: true as const
                    }
                  : {}),
                set: [
                  ...state.delta.graph.entities.edges.added,
                  ...state.delta.graph.entities.edges.updated
                ],
                remove: [...state.delta.graph.entities.edges.removed]
              }
            : undefined
        })
      },
      mindmap: {
        kind: 'family' as const,
        read: createStableMapFamilyRead((state) => state.graph.owners.mindmaps),
        idsEqual: sameOrder,
        change: (state) => toFamilyChange({
          snapshot: createStableMapFamilyRead((current) => current.graph.owners.mindmaps)(state),
          delta: idDelta.hasAny(state.delta.graph.entities.mindmaps)
            ? {
                ...(state.delta.graph.order
                  ? {
                      order: true as const
                    }
                  : {}),
                set: [
                  ...state.delta.graph.entities.mindmaps.added,
                  ...state.delta.graph.entities.mindmaps.updated
                ],
                remove: [...state.delta.graph.entities.mindmaps.removed]
              }
            : undefined
        })
      },
      group: {
        kind: 'family' as const,
        read: createStableMapFamilyRead((state) => state.graph.owners.groups),
        idsEqual: sameOrder,
        change: (state) => toFamilyChange({
          snapshot: createStableMapFamilyRead((current) => current.graph.owners.groups)(state),
          delta: idDelta.hasAny(state.delta.graph.entities.groups)
            ? {
                set: [
                  ...state.delta.graph.entities.groups.added,
                  ...state.delta.graph.entities.groups.updated
                ],
                remove: [...state.delta.graph.entities.groups.removed]
              }
            : undefined
        })
      },
      state: {
        node: {
          kind: 'family' as const,
          read: createStableMapFamilyRead((state) => state.graph.state.node),
          idsEqual: sameOrder,
          change: (state) => toFamilyChange({
            snapshot: createStableMapFamilyRead((current) => current.graph.state.node)(state),
            delta: idDelta.hasAny(state.delta.ui.node)
              ? {
                  set: [
                    ...state.delta.ui.node.added,
                    ...state.delta.ui.node.updated
                  ],
                  remove: [...state.delta.ui.node.removed]
                }
              : undefined
          })
        },
        edge: {
          kind: 'family' as const,
          read: createStableMapFamilyRead((state) => state.graph.state.edge),
          idsEqual: sameOrder,
          change: (state) => toFamilyChange({
            snapshot: createStableMapFamilyRead((current) => current.graph.state.edge)(state),
            delta: idDelta.hasAny(state.delta.ui.edge)
              ? {
                  set: [
                    ...state.delta.ui.edge.added,
                    ...state.delta.ui.edge.updated
                  ],
                  remove: [...state.delta.ui.edge.removed]
                }
              : undefined
          })
        },
        chrome: {
          kind: 'value' as const,
          read: (state) => state.graph.state.chrome,
          change: (state) => toValueChange(
            state.delta.ui.chrome,
            state.graph.state.chrome
          )
        }
      }
    },
    render: {
      node: {
        kind: 'family' as const,
        read: createStableMapFamilyRead((state) => state.render.node),
        idsEqual: sameOrder,
        change: (state) => toFamilyChange({
          snapshot: createStableMapFamilyRead((current) => current.render.node)(state),
          delta: idDelta.hasAny(state.delta.render.node)
            ? {
                set: [
                  ...state.delta.render.node.added,
                  ...state.delta.render.node.updated
                ],
                remove: [...state.delta.render.node.removed]
              }
            : undefined
        })
      },
      edge: {
        statics: {
          kind: 'family' as const,
          read: createStableFamilyRead((state) => state.render.statics),
          idsEqual: sameOrder,
          change: (state) => toFamilyChange({
            snapshot: createStableFamilyRead((current) => current.render.statics)(state),
            delta: (
              idDelta.hasAny(state.delta.render.edge.statics)
              || state.delta.render.edge.staticsIds
            )
              ? {
                  ...(state.delta.render.edge.staticsIds
                    ? {
                        order: true as const
                      }
                    : {}),
                  set: [
                    ...state.delta.render.edge.statics.added,
                    ...state.delta.render.edge.statics.updated
                  ],
                  remove: [...state.delta.render.edge.statics.removed]
                }
              : undefined
          })
        },
        active: {
          kind: 'family' as const,
          read: createStableMapFamilyRead((state) => state.render.active),
          idsEqual: sameOrder,
          change: (state) => toFamilyChange({
            snapshot: createStableMapFamilyRead((current) => current.render.active)(state),
            delta: (
              idDelta.hasAny(state.delta.render.edge.active)
              || state.delta.render.edge.activeIds
            )
              ? {
                  ...(state.delta.render.edge.activeIds
                    ? {
                        order: true as const
                      }
                    : {}),
                  set: [
                    ...state.delta.render.edge.active.added,
                    ...state.delta.render.edge.active.updated
                  ],
                  remove: [...state.delta.render.edge.active.removed]
                }
              : undefined
          })
        },
        labels: {
          kind: 'family' as const,
          read: createStableFamilyRead((state) => state.render.labels),
          idsEqual: sameOrder,
          change: (state) => toFamilyChange({
            snapshot: createStableFamilyRead((current) => current.render.labels)(state),
            delta: (
              idDelta.hasAny(state.delta.render.edge.labels)
              || state.delta.render.edge.labelsIds
            )
              ? {
                  ...(state.delta.render.edge.labelsIds
                    ? {
                        order: true as const
                      }
                    : {}),
                  set: [
                    ...state.delta.render.edge.labels.added,
                    ...state.delta.render.edge.labels.updated
                  ],
                  remove: [...state.delta.render.edge.labels.removed]
                }
              : undefined
          })
        },
        masks: {
          kind: 'family' as const,
          read: createStableFamilyRead((state) => state.render.masks),
          idsEqual: sameOrder,
          change: (state) => toFamilyChange({
            snapshot: createStableFamilyRead((current) => current.render.masks)(state),
            delta: (
              idDelta.hasAny(state.delta.render.edge.masks)
              || state.delta.render.edge.masksIds
            )
              ? {
                  ...(state.delta.render.edge.masksIds
                    ? {
                        order: true as const
                      }
                    : {}),
                  set: [
                    ...state.delta.render.edge.masks.added,
                    ...state.delta.render.edge.masks.updated
                  ],
                  remove: [...state.delta.render.edge.masks.removed]
                }
              : undefined
          })
        }
      },
      chrome: {
        scene: {
          kind: 'value' as const,
          read: (state) => state.render.chrome,
          change: (state) => toValueChange(
            state.delta.render.chrome.scene,
            state.render.chrome
          )
        },
        edge: {
          kind: 'value' as const,
          read: (state) => state.render.overlay,
          change: (state) => toValueChange(
            state.delta.render.chrome.edge,
            state.render.overlay
          )
        }
      }
    },
    items: {
      kind: 'family' as const,
      read: createStableFamilyRead((state) => state.items),
      idsEqual: sameOrder,
      change: (state) => toFamilyChange({
        snapshot: createStableFamilyRead((current) => current.items)(state),
        delta: state.delta.items.change
      })
    }
  } satisfies ProjectionStoreTree<WorkingState>,
  phases: {
    document: (ctx) => {
      const dirty = readProjectionDirty(ctx)
      const previousDocumentRevision = ctx.state.revision.document
      const previousBackground = ctx.state.document.background

      dirty.previousDocument = ctx.state.document.snapshot
      resetDocumentPhaseDelta(ctx.state)

      patchDocumentState({
        current: ctx.input,
        working: ctx.state,
        reset: ctx.dirty.reset
      })
      ctx.state.execution = createWhiteboardSceneExecution(ctx.input)

      if (
        ctx.revision === 1
        || previousDocumentRevision !== ctx.input.document.rev
      ) {
        ctx.state.delta.document.revision = true
        ctx.phase.document.changed = true
      }

      if (
        ctx.revision === 1
        || previousBackground !== ctx.state.document.background
      ) {
        ctx.state.delta.document.background = true
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
          execution: ctx.state.execution,
          working: ctx.state,
          reset: ctx.revision === 1 || ctx.state.execution.reset,
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
        if (
          !(
            ctx.revision === 1
            || ctx.state.execution.reset
            || ctx.state.execution.order
            || executionScopeHasAny(ctx.state.execution.change.graph.geometry.node)
            || executionScopeHasAny(ctx.state.execution.change.graph.geometry.edge)
            || executionScopeHasAny(ctx.state.execution.change.graph.geometry.mindmap)
            || executionScopeHasAny(ctx.state.execution.change.graph.geometry.group)
          )
        ) {
          resetSpatialDelta(ctx.state.delta.spatial)
          return
        }

        const result = patchSpatial({
          revision: ctx.revision,
          graph: ctx.state.graph,
          snapshot: toDocumentSnapshot(ctx.input.document),
          graphDelta: ctx.state.delta.graph,
          state: ctx.state.spatial,
          reset: ctx.revision === 1 || ctx.state.execution.reset,
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
        ctx.state.execution.change.items = new Set<SceneItemKey>()

        if (
          !(
            ctx.revision === 1
            || ctx.state.execution.reset
            || ctx.state.execution.order
            || executionScopeHasAny(ctx.state.execution.change.graph.entity.node)
            || executionScopeHasAny(ctx.state.execution.change.graph.entity.edge)
            || executionScopeHasAny(ctx.state.execution.change.graph.entity.mindmap)
            || executionScopeHasAny(ctx.state.execution.change.graph.entity.group)
          )
        ) {
          resetItemsPhaseDelta(ctx.state)
          return
        }

        const result = patchItemsState({
          revision: ctx.revision,
          snapshot: toDocumentSnapshot(ctx.input.document),
          working: ctx.state,
          reset: ctx.revision === 1 || ctx.state.execution.reset
        })

        if (!result.changed) {
          return
        }

        ctx.state.execution.change.items = (
          ctx.revision === 1 || ctx.state.execution.reset
            ? 'all'
            : collectItemChangeScope(ctx.state)
        )
        ctx.phase.items.changed = true
      }
    },
    ui: {
      after: ['graph'],
      run: (ctx) => {
        const count = patchUiState({
          current: ctx.input,
          execution: ctx.state.execution,
          working: ctx.state,
          reset: ctx.revision === 1 || ctx.state.execution.reset
        })

        if (count > 0) {
          ctx.phase.ui.changed = true
          return
        }

        resetUiPhaseDelta(ctx.state)
      }
    },
    render: {
      after: ['graph', 'items', 'ui'],
      run: (ctx) => {
        const count = patchRenderState({
          current: ctx.input,
          execution: ctx.state.execution,
          working: ctx.state,
          reset: ctx.revision === 1 || ctx.state.execution.reset
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
