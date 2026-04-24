import {
  store
} from '@shared/core'
import type { IdDelta } from '@shared/projector'
import type {
  Change,
  ChromeView,
  EdgeUiView,
  EdgeView,
  GroupView,
  MindmapView,
  NodeUiView,
  NodeView,
  Result,
  SceneItem,
  Snapshot,
  UiSnapshot
} from '@whiteboard/editor-graph'

export interface ProjectionSources {
  snapshot: store.ReadStore<Snapshot>
  items: store.ReadStore<readonly SceneItem[]>
  chrome: store.ReadStore<ChromeView>
  nodeGraphIds: store.ReadStore<readonly string[]>
  nodeGraph: store.KeyedReadStore<string, NodeView | undefined>
  edgeGraphIds: store.ReadStore<readonly string[]>
  edgeGraph: store.KeyedReadStore<string, EdgeView | undefined>
  mindmap: store.KeyedReadStore<string, MindmapView | undefined>
  group: store.KeyedReadStore<string, GroupView | undefined>
  nodeUi: store.KeyedReadStore<string, NodeUiView | undefined>
  edgeUi: store.KeyedReadStore<string, EdgeUiView | undefined>
}

export interface ProjectionSourceState {
  sources: ProjectionSources
  sync(result: Result): void
}

const createFamilyRead = <Key, Value>(
  family: store.FamilyStore<Key, Value>
): store.KeyedReadStore<Key, Value | undefined> => store.createKeyedReadStore({
  get: key => family.read.get(key),
  subscribe: (key, listener) => family.byId.subscribe.key(key, listener),
  isEqual: (left, right) => left === right
})

const toSetEntries = <Key extends string, Value>(
  change: IdDelta<Key>,
  byId: ReadonlyMap<Key, Value>
): readonly (readonly [Key, Value])[] | undefined => {
  const set: Array<readonly [Key, Value]> = []
  const collect = (ids: ReadonlySet<Key>) => {
    ids.forEach((id) => {
      const value = byId.get(id)
      if (value !== undefined) {
        set.push([id, value])
      }
    })
  }

  collect(change.added)
  collect(change.updated)

  return set.length > 0
    ? set
    : undefined
}

const toRemoveIds = <Key extends string>(
  change: IdDelta<Key>
): readonly Key[] | undefined => {
  if (change.removed.size === 0) {
    return undefined
  }

  return [...change.removed]
}

const applyFamilyChange = <Key extends string, Value>({
  target,
  previous,
  next,
  change
}: {
  target: store.FamilyStore<Key, Value>
  previous: store.StoreFamily<Key, Value>
  next: store.StoreFamily<Key, Value>
  change: IdDelta<Key>
}) => {
  const ids = previous.ids === next.ids
    ? undefined
    : next.ids
  const set = toSetEntries(change, next.byId)
  const remove = toRemoveIds(change)

  if (ids === undefined && !set?.length && !remove?.length) {
    return
  }

  target.write.apply({
    ...(ids !== undefined ? {
      ids
    } : {}),
    ...(set?.length ? {
      set
    } : {}),
    ...(remove?.length ? {
      remove
    } : {})
  })
}

export const createProjectionSources = (
  initial: Snapshot
): ProjectionSourceState => {
  const snapshot = store.createValueStore(initial)
  const items = store.createValueStore(initial.items)
  const chrome = store.createValueStore(initial.ui.chrome)
  const nodeGraphFamily = store.createFamilyStore({
    initial: initial.graph.nodes
  })
  const edgeGraphFamily = store.createFamilyStore({
    initial: initial.graph.edges
  })
  const mindmapFamily = store.createFamilyStore({
    initial: initial.graph.owners.mindmaps
  })
  const groupFamily = store.createFamilyStore({
    initial: initial.graph.owners.groups
  })
  const nodeUiFamily = store.createFamilyStore({
    initial: initial.ui.nodes
  })
  const edgeUiFamily = store.createFamilyStore({
    initial: initial.ui.edges
  })

  return {
    sources: {
      snapshot,
      items,
      chrome,
      nodeGraphIds: nodeGraphFamily.ids,
      nodeGraph: createFamilyRead(nodeGraphFamily),
      edgeGraphIds: edgeGraphFamily.ids,
      edgeGraph: createFamilyRead(edgeGraphFamily),
      mindmap: createFamilyRead(mindmapFamily),
      group: createFamilyRead(groupFamily),
      nodeUi: createFamilyRead(nodeUiFamily),
      edgeUi: createFamilyRead(edgeUiFamily)
    },
    sync: (result) => {
      const previous = snapshot.get()
      const next = result.snapshot
      const change: Change = result.change

      store.batch(() => {
        snapshot.set(next)

        applyFamilyChange({
          target: nodeGraphFamily,
          previous: previous.graph.nodes,
          next: next.graph.nodes,
          change: change.graph.nodes
        })
        applyFamilyChange({
          target: edgeGraphFamily,
          previous: previous.graph.edges,
          next: next.graph.edges,
          change: change.graph.edges
        })
        applyFamilyChange({
          target: mindmapFamily,
          previous: previous.graph.owners.mindmaps,
          next: next.graph.owners.mindmaps,
          change: change.graph.owners.mindmaps
        })
        applyFamilyChange({
          target: groupFamily,
          previous: previous.graph.owners.groups,
          next: next.graph.owners.groups,
          change: change.graph.owners.groups
        })
        applyFamilyChange({
          target: nodeUiFamily,
          previous: previous.ui.nodes,
          next: next.ui.nodes,
          change: change.ui.nodes
        })
        applyFamilyChange({
          target: edgeUiFamily,
          previous: previous.ui.edges,
          next: next.ui.edges,
          change: change.ui.edges
        })

        if (change.items.changed) {
          items.set(next.items)
        }
        if (change.ui.chrome.changed) {
          chrome.set(next.ui.chrome)
        }
      })
    }
  }
}
