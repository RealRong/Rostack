import type { Revision } from '@shared/projection'
import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
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
  nodes: EntityFamily<NodeId, NodeView>
  edges: EntityFamily<EdgeId, EdgeView>
  owners: {
    mindmaps: EntityFamily<MindmapId, MindmapView>
    groups: EntityFamily<GroupId, GroupView>
  }
}

export interface RenderCapture {
  edge: {
    statics: EntityFamily<EdgeStaticId, EdgeStaticView>
    active: EntityFamily<EdgeId, EdgeActiveView>
    labels: EntityFamily<EdgeLabelKey, EdgeLabelView>
    masks: EntityFamily<EdgeId, EdgeMaskView>
    overlay: EdgeOverlayView
  }
}

export interface UiCapture {
  chrome: ChromeView
  nodes: EntityFamily<NodeId, NodeUiView>
  edges: EntityFamily<EdgeId, EdgeUiView>
}
