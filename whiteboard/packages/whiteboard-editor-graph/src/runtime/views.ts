import type {
  EdgeId,
  Point,
  Rect,
  Size
} from '@whiteboard/core/types'
import { edge as edgeApi } from '@whiteboard/core/edge'
import { node as nodeApi } from '@whiteboard/core/node'
import type {
  EdgeLabelView,
  EdgeView,
  GroupView,
  MindmapView,
  NodeView,
  SessionInput
} from '../contracts/editor'
import type {
  GraphEdgeEntry,
  GraphNodeEntry,
  WorkingState
} from '../contracts/working'
import { collectRects } from './geometry'
import {
  buildProjectedNodeGeometry,
  readEdgePoints,
  readProjectedEdge,
  readProjectedEdgeNodes
} from './projection'

export const buildNodeView = (input: {
  entry: GraphNodeEntry
  measuredSize?: Size
  treeRect?: Rect
  edit: SessionInput['edit']
}): NodeView => {
  const geometry = buildProjectedNodeGeometry(input)

  return {
    base: input.entry.base,
    layout: {
      measuredSize: input.measuredSize,
      rotation: geometry.rotation,
      rect: geometry.rect,
      bounds: geometry.bounds
    },
    render: {
      hidden: input.entry.preview?.hidden ?? false,
      editing: input.edit?.kind === 'node'
        && input.edit.nodeId === input.entry.base.node.id
    }
  }
}

const toEdgeNodeSnapshot = (
  nodeView: NodeView | undefined
) => nodeView
  ? {
      node: nodeView.base.node,
      geometry: nodeApi.outline.geometry(
        nodeView.base.node,
        nodeView.layout.rect,
        nodeView.layout.rotation
      )
    }
  : undefined

const buildEdgeLabelRect = (
  point: Point,
  size: Size
): Rect => ({
  x: point.x - size.width / 2,
  y: point.y - size.height / 2,
  width: size.width,
  height: size.height
})

export const buildEdgeView = (input: {
  edgeId: EdgeId
  entry: GraphEdgeEntry
  nodes: ReadonlyMap<string, NodeView>
  labelMeasures?: ReadonlyMap<string, { size: Size }>
  edit: SessionInput['edit']
}): EdgeView => {
  const edge = readProjectedEdge(input.entry)
  const geometry = (() => {
    try {
      return edgeApi.view.resolve({
        edge,
        source: edge.source.kind === 'node'
          ? toEdgeNodeSnapshot(input.nodes.get(edge.source.nodeId))
          : undefined,
        target: edge.target.kind === 'node'
          ? toEdgeNodeSnapshot(input.nodes.get(edge.target.nodeId))
          : undefined
      })
    } catch {
      return undefined
    }
  })()
  const textMode = edge.textMode ?? 'horizontal'
  const labels = (edge.labels ?? []).map((label) => {
    const editSession = input.edit?.kind === 'edge-label'
      && input.edit.edgeId === input.edgeId
      && input.edit.labelId === label.id
      ? input.edit
      : undefined
    const text = editSession
      ? editSession.text
      : label.text ?? ''
    const measuredSize = input.labelMeasures?.get(label.id)?.size
    const size = edgeApi.label.placementSize({
      textMode,
      measuredSize,
      text,
      fontSize: label.style?.size
    })
    const placement = geometry
      ? edgeApi.label.placement({
          path: geometry.path,
          t: label.t,
          offset: label.offset,
          textMode,
          labelSize: size,
          sideGap: edgeApi.label.sideGap(textMode)
        })
      : undefined

    return {
      labelId: label.id,
      text,
      size,
      point: placement?.point,
      angle: textMode === 'tangent'
        ? placement?.angle
        : 0,
      rect: placement?.point && size
        ? buildEdgeLabelRect(placement.point, size)
        : undefined
    } satisfies EdgeLabelView
  })
  const pathBounds = geometry
    ? edgeApi.path.bounds(geometry.path)
    : undefined
  const bounds = collectRects([
    ...(
      pathBounds
        ? [pathBounds]
        : []
    ),
    ...labels.flatMap((label) => label.rect ? [label.rect] : [])
  ])

  return {
    base: {
      edge: input.entry.base.edge,
      nodes: readProjectedEdgeNodes(edge)
    },
    route: {
      points: geometry?.path.points ?? readEdgePoints(edge),
      svgPath: geometry?.path.svgPath,
      bounds,
      source: geometry?.ends.source.point,
      target: geometry?.ends.target.point,
      labels
    },
    render: {
      hidden: false,
      editingLabelId: input.edit?.kind === 'edge-label'
        && input.edit.edgeId === input.edgeId
        ? input.edit.labelId
        : undefined
    }
  }
}

export const buildMindmapView = (input: {
  mindmapId: string
  working: WorkingState
}): MindmapView | undefined => {
  const mindmap = input.working.input.document.snapshot.state.facts.entities.owners.mindmaps.get(input.mindmapId)
  const structure = input.working.structure.mindmaps.get(input.mindmapId)
  const tree = input.working.tree.mindmaps.get(input.mindmapId)

  if (!mindmap || !structure) {
    return undefined
  }

  return {
    base: {
      mindmap
    },
    structure: {
      nodeIds: structure.nodeIds
    },
    tree: {
      layout: tree?.layout,
      bbox: tree?.layout?.bbox
    },
    render: {
      connectors: tree?.connectors ?? []
    }
  }
}

export const buildGroupView = (input: {
  groupId: string
  working: WorkingState
}): GroupView | undefined => {
  const group = input.working.input.document.snapshot.state.facts.entities.owners.groups.get(input.groupId)
  const structure = input.working.structure.groups.get(input.groupId)

  if (!group || !structure) {
    return undefined
  }

  const rects: Rect[] = []
  structure.itemIds.forEach((item) => {
    if (item.kind === 'node') {
      const rect = input.working.element.nodes.get(item.id)?.layout.bounds
      if (rect) {
        rects.push(rect)
      }
      return
    }

    if (item.kind === 'mindmap') {
      const rect = input.working.tree.mindmaps.get(item.id)?.layout?.bbox
      if (rect) {
        rects.push(rect)
      }
    }
  })

  return {
    base: {
      group
    },
    structure: {
      items: structure.itemIds
    },
    frame: {
      bounds: collectRects(rects)
    }
  }
}
