import { store } from '@shared/core'
import type {
  Change,
  ChromeView,
  EdgeUiView,
  EdgeView,
  GraphSnapshot,
  GroupView,
  MindmapView,
  NodeUiView,
  NodeView,
  SceneSnapshot,
  SelectionView,
  Snapshot
} from '@whiteboard/editor-graph'

export interface ProjectionSources {
  snapshot: store.ReadStore<Snapshot>
  graph: store.ReadStore<GraphSnapshot>
  scene: store.ReadStore<SceneSnapshot>
  ui: store.ReadStore<Snapshot['ui']>
  selection: store.ReadStore<SelectionView>
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
  scene: store.createProjectedStore({
    source: snapshot,
    select: (current) => current.scene
  }),
  ui: store.createProjectedStore({
    source: snapshot,
    select: (current) => current.ui
  }),
  selection: store.createProjectedStore({
    source: snapshot,
    select: (current) => current.ui.selection
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

export const graphChangeTouchesId = (
  change: Change['graph']['nodes'] | Change['graph']['edges'] | Change['graph']['owners']['mindmaps'] | Change['graph']['owners']['groups'],
  id: string
): boolean => change.all.has(id)
