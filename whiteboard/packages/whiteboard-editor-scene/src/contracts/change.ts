import {
  defineChangeSpec,
  changeFlag as flag,
  ids,
  changeSet as set
} from '@shared/delta'
import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'

export const sceneInputChangeSpec = defineChangeSpec({
  document: {
    reset: flag(),
    order: flag(),
    nodes: ids<NodeId>(),
    edges: ids<EdgeId>(),
    mindmaps: ids<MindmapId>(),
    groups: ids<GroupId>()
  },
  session: {
    tool: flag(),
    selection: flag(),
    hover: flag(),
    edit: flag(),
    interaction: flag(),
    draft: {
      nodes: ids<NodeId>(),
      edges: ids<EdgeId>()
    },
    preview: {
      nodes: ids<NodeId>(),
      edges: ids<EdgeId>(),
      mindmaps: ids<MindmapId>(),
      marquee: flag(),
      guides: flag(),
      draw: flag(),
      edgeGuide: flag()
    }
  },
  clock: {
    mindmaps: set<MindmapId>()
  }
})
