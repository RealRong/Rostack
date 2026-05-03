import type { Revision } from '@shared/projection'
import type {
  EdgeView,
  EdgeUiView,
  GroupView,
  MindmapView,
  NodeUiView,
  NodeView,
  SceneItem,
  ChromeView
} from './editor'
import type { SceneItemKey } from './delta'
import type {
  EdgeActiveView,
  EdgeLabelKey,
  EdgeLabelView,
  EdgeMaskView,
  EdgeOverlayView,
  EdgeStaticId,
  EdgeStaticView
} from './render'

export interface EntityFamily<TKey extends string, TValue> {
  ids: readonly TKey[]
  byId: ReadonlyMap<TKey, TValue>
}

export interface Capture {
  revision: Revision
  documentRevision: Revision
  graph: GraphCapture
  render: RenderCapture
  items: EntityFamily<SceneItemKey, SceneItem>
  ui: UiCapture
}

export interface GraphCapture {
  nodes: EntityFamily<string, NodeView>
  edges: EntityFamily<string, EdgeView>
  owners: {
    mindmaps: EntityFamily<string, MindmapView>
    groups: EntityFamily<string, GroupView>
  }
}

export interface RenderCapture {
  edge: {
    statics: EntityFamily<EdgeStaticId, EdgeStaticView>
    active: EntityFamily<string, EdgeActiveView>
    labels: EntityFamily<EdgeLabelKey, EdgeLabelView>
    masks: EntityFamily<string, EdgeMaskView>
    overlay: EdgeOverlayView
  }
}

export interface UiCapture {
  chrome: ChromeView
  nodes: EntityFamily<string, NodeUiView>
  edges: EntityFamily<string, EdgeUiView>
}
