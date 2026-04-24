import { store } from '@shared/core'
import type {
  ChromeView,
  EdgeUiView,
  EdgeView,
  GraphSnapshot,
  GroupView,
  MindmapView,
  NodeUiView,
  NodeView,
  SceneItem,
  Snapshot
} from '@whiteboard/editor-graph'

export interface ProjectionSources {
  snapshot: store.ReadStore<Snapshot>
  graph: store.ReadStore<GraphSnapshot>
  items: store.ReadStore<readonly SceneItem[]>
  ui: store.ReadStore<Snapshot['ui']>
  chrome: store.ReadStore<ChromeView>
  nodeGraph: store.KeyedReadStore<string, NodeView | undefined>
  edgeGraph: store.KeyedReadStore<string, EdgeView | undefined>
  mindmap: store.KeyedReadStore<string, MindmapView | undefined>
  group: store.KeyedReadStore<string, GroupView | undefined>
  nodeUi: store.KeyedReadStore<string, NodeUiView | undefined>
  edgeUi: store.KeyedReadStore<string, EdgeUiView | undefined>
}

export const createProjectionSources = (
  snapshot: store.ReadStore<Snapshot>
): ProjectionSources => ({
  snapshot,
  graph: store.createProjectedStore({
    source: snapshot,
    select: (current) => current.graph
  }),
  items: store.createProjectedStore({
    source: snapshot,
    select: (current) => current.items
  }),
  ui: store.createProjectedStore({
    source: snapshot,
    select: (current) => current.ui
  }),
  chrome: store.createProjectedStore({
    source: snapshot,
    select: (current) => current.ui.chrome
  }),
  nodeGraph: store.createProjectedKeyedStore({
    source: snapshot,
    select: (current) => current.graph.nodes.byId,
    emptyValue: undefined
  }),
  edgeGraph: store.createProjectedKeyedStore({
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
  }),
  nodeUi: store.createProjectedKeyedStore({
    source: snapshot,
    select: (current) => current.ui.nodes.byId,
    emptyValue: undefined
  }),
  edgeUi: store.createProjectedKeyedStore({
    source: snapshot,
    select: (current) => current.ui.edges.byId,
    emptyValue: undefined
  })
})
