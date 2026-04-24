import type {
  Edge,
  Node,
  NodeModel,
  Point,
  Rect,
  Size
} from '@whiteboard/core/types'
import { edge as edgeApi } from '@whiteboard/core/edge'
import { node as nodeApi } from '@whiteboard/core/node'
import type {
  SessionInput,
  NodeDraft,
  NodePreview
} from '../contracts/editor'
import type {
  GraphEdgeEntry,
  GraphNodeEntry
} from '../contracts/working'
import { EMPTY_SIZE } from './geometry'

const nodeModelCache = new WeakMap<Node, NodeModel>()

const readNodePatch = (
  draft?: NodeDraft,
  preview?: NodePreview
) => preview?.patch ?? (
  draft?.kind === 'patch'
    ? draft.fields
    : undefined
)

const readEdgePatch = (
  entry: GraphEdgeEntry
) => entry.preview?.patch ?? entry.draft?.patch

const readNodeSize = (
  node: GraphNodeEntry['base']['node']
): Size => node.size
  ?? nodeApi.bootstrap.resolve(node)
  ?? EMPTY_SIZE

const toNodeModel = (
  node: Node
): NodeModel => {
  const cached = nodeModelCache.get(node)
  if (cached) {
    return cached
  }

  const {
    position: _position,
    size: _size,
    rotation: _rotation,
    ...model
  } = node
  nodeModelCache.set(node, model)
  return model
}

const readNodeTextDraft = (input: {
  entry: GraphNodeEntry
  edit: SessionInput['edit']
}) => {
  const { edit, entry } = input
  if (!edit || edit.kind !== 'node' || edit.nodeId !== entry.base.node.id) {
    return undefined
  }

  return {
    field: edit.field,
    value: edit.text,
    size:
      edit.field === 'text'
      && entry.draft?.kind === 'size'
        ? entry.draft.size
        : undefined,
    fontSize:
      edit.field === 'text'
      && entry.base.node.type === 'sticky'
      && entry.draft?.kind === 'fit'
        ? entry.draft.fontSize
        : undefined
  }
}

export const readProjectedNodeRotation = (
  entry: GraphNodeEntry
): number => {
  const patch = readNodePatch(entry.draft, entry.preview)
  return patch?.rotation ?? entry.base.node.rotation ?? 0
}

export const readProjectedNodeSize = (input: {
  entry: GraphNodeEntry
  measuredSize?: Size
}): Size => {
  const patch = readNodePatch(input.entry.draft, input.entry.preview)

  return patch?.size
    ?? input.measuredSize
    ?? (
      input.entry.draft?.kind === 'size'
        ? input.entry.draft.size
        : undefined
    )
    ?? readNodeSize(input.entry.base.node)
}

export const readProjectedNodeRect = (input: {
  entry: GraphNodeEntry
  measuredSize?: Size
  treeRect?: Rect
}): Rect => {
  if (input.treeRect) {
    return input.treeRect
  }

  const patch = readNodePatch(input.entry.draft, input.entry.preview)
  const position = patch?.position ?? input.entry.base.node.position
  const size = readProjectedNodeSize({
    entry: input.entry,
    measuredSize: input.measuredSize
  })

  return {
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height
  }
}

export const buildProjectedNodeGeometry = (input: {
  entry: GraphNodeEntry
  measuredSize?: Size
  treeRect?: Rect
}) => {
  const rect = readProjectedNodeRect(input)
  const rotation = readProjectedNodeRotation(input.entry)
  const geometry = nodeApi.outline.geometry(
    input.entry.base.node,
    rect,
    rotation
  )

  return {
    rect,
    rotation,
    bounds: geometry.bounds
  }
}

export const buildProjectedNodeView = (input: {
  entry: GraphNodeEntry
  measuredSize?: Size
  treeRect?: Rect
  edit: SessionInput['edit']
}) => {
  const geometry = buildProjectedNodeGeometry(input)
  const previewItem = nodeApi.projection.applyTextPreview({
    node: input.entry.base.node,
    rect: geometry.rect
  }, input.entry.preview?.patch)
  const contentItem = nodeApi.projection.applyTextDraft(
    previewItem,
    readNodeTextDraft(input)
  )

  return {
    node: toNodeModel(contentItem.node),
    rect: contentItem.rect,
    rotation: geometry.rotation,
    bounds: nodeApi.outline.geometry(
      contentItem.node,
      contentItem.rect,
      geometry.rotation
    ).bounds
  }
}

export const readProjectedEdge = (
  entry: GraphEdgeEntry
): Edge => {
  const patch = readEdgePatch(entry)
  return patch
    ? edgeApi.patch.apply(entry.base.edge, patch)
    : entry.base.edge
}

export const readProjectedEdgeNodes = (
  edge: Edge
) => ({
  source: edge.source.kind === 'node'
    ? edge.source.nodeId
    : undefined,
  target: edge.target.kind === 'node'
    ? edge.target.nodeId
    : undefined
})

export const readEdgePoints = (
  edge: Edge
): readonly Point[] => edge.route?.kind === 'manual'
  ? edge.route.points
  : []
