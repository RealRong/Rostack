import type { Family, Revision } from '@shared/projection'
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
import type {
  EdgeActiveView,
  EdgeLabelKey,
  EdgeLabelView,
  EdgeMaskView,
  EdgeOverlayView,
  EdgeStaticId,
  EdgeStaticView
} from './render'

export interface Capture {
  revision: Revision
  documentRevision: Revision
  graph: GraphCapture
  render: RenderCapture
  items: readonly SceneItem[]
  ui: UiCapture
}

export interface GraphCapture {
  nodes: Family<NodeId, NodeView>
  edges: Family<EdgeId, EdgeView>
  owners: {
    mindmaps: Family<MindmapId, MindmapView>
    groups: Family<GroupId, GroupView>
  }
}

export interface RenderCapture {
  edge: {
    statics: Family<EdgeStaticId, EdgeStaticView>
    active: Family<EdgeId, EdgeActiveView>
    labels: Family<EdgeLabelKey, EdgeLabelView>
    masks: Family<EdgeId, EdgeMaskView>
    overlay: EdgeOverlayView
  }
}

export interface UiCapture {
  chrome: ChromeView
  nodes: Family<NodeId, NodeUiView>
  edges: Family<EdgeId, EdgeUiView>
}
