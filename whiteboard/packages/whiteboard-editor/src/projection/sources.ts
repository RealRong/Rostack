import {
  store
} from '@shared/core'
import {
  composeSync,
  createIdDeltaFamilySync,
  createValueSync
} from '@shared/projector'
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
  Snapshot
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

interface ProjectionSink {
  snapshot: store.ValueStore<Snapshot>
  items: store.ValueStore<readonly SceneItem[]>
  chrome: store.ValueStore<ChromeView>
  nodeGraph: store.FamilyStore<string, NodeView>
  edgeGraph: store.FamilyStore<string, EdgeView>
  mindmap: store.FamilyStore<string, MindmapView>
  group: store.FamilyStore<string, GroupView>
  nodeUi: store.FamilyStore<string, NodeUiView>
  edgeUi: store.FamilyStore<string, EdgeUiView>
}

const createFamilyRead = <Key, Value>(
  family: store.FamilyStore<Key, Value>
): store.KeyedReadStore<Key, Value | undefined> => store.createKeyedReadStore({
  get: key => family.read.get(key),
  subscribe: (key, listener) => family.byId.subscribe.key(key, listener),
  isEqual: (left, right) => left === right
})

const projectionSync = composeSync<
  Snapshot,
  Change,
  ProjectionSink
>(
  createValueSync({
    hasChanged: () => true,
    read: snapshot => snapshot,
    write: (value, sink) => {
      sink.snapshot.set(value)
    }
  }),
  createValueSync({
    hasChanged: change => change.items.changed,
    read: snapshot => snapshot.items,
    write: (value, sink) => {
      sink.items.set(value)
    }
  }),
  createValueSync({
    hasChanged: change => change.ui.chrome.changed,
    read: snapshot => snapshot.ui.chrome,
    write: (value, sink) => {
      sink.chrome.set(value)
    }
  }),
  createIdDeltaFamilySync({
    delta: change => change.graph.nodes,
    read: snapshot => snapshot.graph.nodes,
    apply: (patch, sink) => {
      sink.nodeGraph.write.apply(patch)
    }
  }),
  createIdDeltaFamilySync({
    delta: change => change.graph.edges,
    read: snapshot => snapshot.graph.edges,
    apply: (patch, sink) => {
      sink.edgeGraph.write.apply(patch)
    }
  }),
  createIdDeltaFamilySync({
    delta: change => change.graph.owners.mindmaps,
    read: snapshot => snapshot.graph.owners.mindmaps,
    apply: (patch, sink) => {
      sink.mindmap.write.apply(patch)
    }
  }),
  createIdDeltaFamilySync({
    delta: change => change.graph.owners.groups,
    read: snapshot => snapshot.graph.owners.groups,
    apply: (patch, sink) => {
      sink.group.write.apply(patch)
    }
  }),
  createIdDeltaFamilySync({
    delta: change => change.ui.nodes,
    read: snapshot => snapshot.ui.nodes,
    apply: (patch, sink) => {
      sink.nodeUi.write.apply(patch)
    }
  }),
  createIdDeltaFamilySync({
    delta: change => change.ui.edges,
    read: snapshot => snapshot.ui.edges,
    apply: (patch, sink) => {
      sink.edgeUi.write.apply(patch)
    }
  })
)

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
  const sink: ProjectionSink = {
    snapshot,
    items,
    chrome,
    nodeGraph: nodeGraphFamily,
    edgeGraph: edgeGraphFamily,
    mindmap: mindmapFamily,
    group: groupFamily,
    nodeUi: nodeUiFamily,
    edgeUi: edgeUiFamily
  }

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

      store.batch(() => {
        projectionSync.sync({
          previous,
          next: result.snapshot,
          change: result.change,
          sink
        })
      })
    }
  }
}
