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
  EdgeBoxView,
  GroupView,
  MindmapView,
  NodeView,
  GroupItemRef,
  SessionInput
} from '../contracts/editor'
import type {
  GraphEdgeEntry,
  GraphNodeEntry
} from '../contracts/working'
import { collectRects } from './geometry'
import {
  buildProjectedNodeView,
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
  const view = buildProjectedNodeView(input)

  return {
    base: {
      node: view.node,
      owner: input.entry.base.owner
    },
    geometry: {
      rotation: view.rotation,
      rect: view.rect,
      bounds: view.bounds
    }
  }
}

const toEdgeNodeSnapshot = (
  nodeView: NodeView | undefined
) => nodeView
  ? {
      node: {
        ...nodeView.base.node,
        position: {
          x: nodeView.geometry.rect.x,
          y: nodeView.geometry.rect.y
        },
        size: {
          width: nodeView.geometry.rect.width,
          height: nodeView.geometry.rect.height
        },
        rotation: nodeView.geometry.rotation
      },
      geometry: nodeApi.outline.geometry(
        nodeView.base.node,
        nodeView.geometry.rect,
        nodeView.geometry.rotation
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

const EDGE_LABEL_PLACEHOLDER = 'Label'
const EDGE_LABEL_MASK_BLEED = 4

const readEdgeLabelDisplayText = (
  value: string,
  editing: boolean
) => value || (editing ? EDGE_LABEL_PLACEHOLDER : '')

const readEdgeBox = (
  rect: Rect | undefined,
  edge: GraphEdgeEntry['base']['edge']
) => rect
  ? ({
      rect,
      pad: Math.max(24, (edge.style?.width ?? 2) + 16)
    } satisfies EdgeBoxView)
  : undefined

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
  const labels = (edge.labels ?? []).flatMap((label) => {
    const editSession = input.edit?.kind === 'edge-label'
      && input.edit.edgeId === input.edgeId
      && input.edit.labelId === label.id
      ? input.edit
      : undefined
    const text = editSession
      ? editSession.text
      : label.text ?? ''
    const displayText = readEdgeLabelDisplayText(text, Boolean(editSession))
    if (!displayText.trim()) {
      return []
    }

    const measuredSize = input.labelMeasures?.get(label.id)?.size
    const size = edgeApi.label.placementSize({
      textMode,
      measuredSize,
      text,
      fontSize: label.style?.size
    })
    if (!size) {
      return []
    }

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

    if (!placement) {
      return []
    }

    const angle = textMode === 'tangent'
      ? placement.angle
      : 0
    const rect = buildEdgeLabelRect(placement.point, size)

    return [{
      labelId: label.id,
      text,
      displayText,
      style: label.style,
      size,
      point: placement.point,
      angle,
      rect,
      maskRect: edgeApi.label.mask({
        center: placement.point,
        size,
        angle,
        margin: EDGE_LABEL_MASK_BLEED
      })
    } satisfies EdgeLabelView]
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
      edge,
      nodes: readProjectedEdgeNodes(edge)
    },
    route: {
      points: geometry?.path.points ?? readEdgePoints(edge),
      svgPath: geometry?.path.svgPath,
      bounds,
      source: geometry?.ends.source.point,
      target: geometry?.ends.target.point,
      ends: geometry?.ends,
      handles: geometry?.handles ?? [],
      labels
    },
    box: readEdgeBox(pathBounds, edge)
  }
}

export const buildMindmapView = (input: {
  mindmap: MindmapView['base']['mindmap']
  rootId: MindmapView['structure']['rootId']
  nodeIds: readonly string[]
  tree: MindmapView['structure']['tree']
  layout?: MindmapView['tree']['layout']
  connectors: readonly MindmapView['render']['connectors'][number][]
}): MindmapView => ({
  base: {
    mindmap: input.mindmap
  },
  structure: {
    rootId: input.rootId,
    nodeIds: input.nodeIds,
    tree: input.tree
  },
  tree: {
    layout: input.layout,
    bbox: input.layout?.bbox
  },
  render: {
    connectors: input.connectors
  }
})

export const buildGroupView = (input: {
  group: GroupView['base']['group']
  items: readonly GroupItemRef[]
  nodes: ReadonlyMap<string, NodeView>
  edges: ReadonlyMap<string, EdgeView>
}): GroupView => {
  const rects: Rect[] = []

  input.items.forEach((item) => {
    if (item.kind === 'node') {
      const rect = input.nodes.get(item.id)?.geometry.bounds
      if (rect) {
        rects.push(rect)
      }
      return
    }

    const rect = input.edges.get(item.id)?.route.bounds
    if (rect) {
      rects.push(rect)
    }
  })

  return {
    base: {
      group: input.group
    },
    structure: {
      items: input.items
    },
    frame: {
      bounds: collectRects(rects)
    }
  }
}
