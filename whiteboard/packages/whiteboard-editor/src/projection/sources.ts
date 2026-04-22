import { store } from '@shared/core'
import type {
  Change,
  ChromeView,
  EdgeView,
  GraphSnapshot,
  GroupView,
  MindmapView,
  NodeView,
  SceneSnapshot,
  SelectionView,
  Snapshot
} from '@whiteboard/editor-graph'

export interface ProjectionSources {
  snapshot: store.ReadStore<Snapshot>
  graph: store.ReadStore<GraphSnapshot>
  scene: store.ReadStore<SceneSnapshot>
  selection: store.ReadStore<SelectionView>
  chrome: store.ReadStore<ChromeView>
  node: store.KeyedReadStore<string, NodeView | undefined>
  edge: store.KeyedReadStore<string, EdgeView | undefined>
  mindmap: store.KeyedReadStore<string, MindmapView | undefined>
  group: store.KeyedReadStore<string, GroupView | undefined>
}

export const createProjectionSources = (
  snapshot: store.ReadStore<Snapshot>
): ProjectionSources => ({
  snapshot,
  graph: store.createProjectedStore({
    source: snapshot,
    select: (current) => current.graph
  }),
  scene: store.createProjectedStore({
    source: snapshot,
    select: (current) => current.scene
  }),
  selection: store.createProjectedStore({
    source: snapshot,
    select: (current) => current.ui.selection
  }),
  chrome: store.createProjectedStore({
    source: snapshot,
    select: (current) => current.ui.chrome
  }),
  node: store.createProjectedKeyedStore({
    source: snapshot,
    select: (current) => current.graph.nodes.byId,
    emptyValue: undefined
  }),
  edge: store.createProjectedKeyedStore({
    source: snapshot,
    select: (current) => current.graph.edges.byId,
    emptyValue: undefined
  }),
  mindmap: store.createProjectedKeyedStore({
    source: snapshot,
    select: (current) => current.graph.owners.mindmaps.byId,
    emptyValue: undefined
  }),
  group: store.createProjectedKeyedStore({
    source: snapshot,
    select: (current) => current.graph.owners.groups.byId,
    emptyValue: undefined
  })
})

export const graphChangeTouchesId = (
  change: Change['graph']['nodes'] | Change['graph']['edges'] | Change['graph']['owners']['mindmaps'] | Change['graph']['owners']['groups'],
  id: string
): boolean => change.all.has(id)
