import type {
  ProjectionFamilyChange,
  ProjectionFamilySnapshot,
  ProjectionStoreTree
} from '@shared/projection'
import {
  type EntityDelta,
  idDelta
} from '@shared/delta'
import type { WorkingState } from '../contracts/working'

const sameOrder = <T,>(
  left: readonly T[],
  right: readonly T[]
): boolean => (
  left.length === right.length
  && left.every((value, index) => Object.is(value, right[index]))
)

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

export const editorSceneStores = {
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
      read: (state) => state.graph.nodes,
      idsEqual: sameOrder,
      change: (state) => toFamilyChange({
        snapshot: state.graph.nodes,
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
      read: (state) => state.graph.edges,
      idsEqual: sameOrder,
      change: (state) => toFamilyChange({
        snapshot: state.graph.edges,
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
      read: (state) => state.graph.owners.mindmaps,
      idsEqual: sameOrder,
      change: (state) => toFamilyChange({
        snapshot: state.graph.owners.mindmaps,
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
      read: (state) => state.graph.owners.groups,
      idsEqual: sameOrder,
      change: (state) => toFamilyChange({
        snapshot: state.graph.owners.groups,
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
        read: (state) => state.graph.state.node,
        idsEqual: sameOrder,
        change: (state) => toFamilyChange({
          snapshot: state.graph.state.node,
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
        read: (state) => state.graph.state.edge,
        idsEqual: sameOrder,
        change: (state) => toFamilyChange({
          snapshot: state.graph.state.edge,
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
      read: (state) => state.render.node,
      idsEqual: sameOrder,
      change: (state) => toFamilyChange({
        snapshot: state.render.node,
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
        read: (state) => state.render.statics,
        idsEqual: sameOrder,
        change: (state) => toFamilyChange({
          snapshot: state.render.statics,
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
        read: (state) => state.render.active,
        idsEqual: sameOrder,
        change: (state) => toFamilyChange({
          snapshot: state.render.active,
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
        read: (state) => state.render.labels,
        idsEqual: sameOrder,
        change: (state) => toFamilyChange({
          snapshot: state.render.labels,
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
        read: (state) => state.render.masks,
        idsEqual: sameOrder,
        change: (state) => toFamilyChange({
          snapshot: state.render.masks,
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
    read: (state) => state.items,
    idsEqual: sameOrder,
    change: (state) => toFamilyChange({
      snapshot: state.items,
      delta: state.delta.items.change
    })
  }
} satisfies ProjectionStoreTree<WorkingState>
