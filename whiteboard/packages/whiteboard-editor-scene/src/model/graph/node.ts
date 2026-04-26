import { equal } from '@shared/core'
import { idDelta } from '@shared/delta'
import { node as nodeApi } from '@whiteboard/core/node'
import type {
  Node,
  NodeId,
  NodeModel,
  Rect,
  Size
} from '@whiteboard/core/types'
import type { GraphDelta } from '../../contracts/delta'
import type {
  Input,
  NodeDraft,
  NodePreview,
  OwnerRef,
  SessionInput,
  NodeView
} from '../../contracts/editor'
import type {
  GraphNodeEntry,
  WorkingState
} from '../../contracts/working'

const EMPTY_SIZE: Size = {
  width: 0,
  height: 0
}

const nodeModelCache = new WeakMap<Node, NodeModel>()

const readNodePatch = (
  draft?: NodeDraft,
  preview?: NodePreview
) => preview?.patch ?? (
  draft?.kind === 'patch'
    ? draft.fields
    : undefined
)

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

const isSameOwner = (
  left: OwnerRef | undefined,
  right: OwnerRef | undefined
): boolean => left?.kind === right?.kind
  && left?.id === right?.id

const isNodeViewEqual = (
  left: NodeView,
  right: NodeView
): boolean => (
  left.base.node === right.base.node
  && isSameOwner(left.base.owner, right.base.owner)
  && left.geometry.rotation === right.geometry.rotation
  && equal.sameRect(left.geometry.rect, right.geometry.rect)
  && equal.sameRect(left.geometry.bounds, right.geometry.bounds)
)

const isNodeGeometryChanged = (
  previous: NodeView | undefined,
  next: NodeView | undefined
): boolean => (
  previous === undefined
  || next === undefined
  || previous.geometry.rotation !== next.geometry.rotation
  || !equal.sameRect(previous.geometry.rect, next.geometry.rect)
  || !equal.sameRect(previous.geometry.bounds, next.geometry.bounds)
)

export const readNodeEntry = (
  input: Input,
  working: WorkingState,
  ownerByNode: WorkingState['indexes']['ownerByNode'],
  nodeId: NodeId
): GraphNodeEntry | undefined => {
  const node = working.document.snapshot.nodes[nodeId]
  if (!node) {
    return undefined
  }

  return {
    base: {
      node,
      owner: ownerByNode.get(nodeId)
    },
    draft: input.session.draft.nodes.get(nodeId),
    preview: input.session.preview.nodes.get(nodeId)
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

const buildProjectedNodeGeometry = (input: {
  entry: GraphNodeEntry
  measuredSize?: Size
  treeRect?: Rect
}) => {
  const rect = readProjectedNodeRect(input)
  const rotation = readProjectedNodeRotation(input.entry)

  return {
    rect,
    rotation
  }
}

export const readMeasuredNodeSize = (input: {
  working: WorkingState
  entry: GraphNodeEntry
  nodeId: NodeId
  treeRect?: Rect
  edit: SessionInput['edit']
}): Size | undefined => {
  if (
    !input.working.measure
    || input.edit?.kind !== 'node'
    || input.edit.nodeId !== input.nodeId
    || input.edit.field !== 'text'
  ) {
    return undefined
  }

  const patch = readNodePatch(input.entry.draft, input.entry.preview)
  const fallbackRect = input.treeRect ?? (() => {
    const position = patch?.position ?? input.entry.base.node.position
    const size = patch?.size ?? readNodeSize(input.entry.base.node)
    return {
      x: position.x,
      y: position.y,
      width: size.width,
      height: size.height
    }
  })()
  const previewItem = nodeApi.projection.applyTextPreview({
    node: input.entry.base.node,
    rect: fallbackRect
  }, input.entry.preview?.patch)
  const contentItem = nodeApi.projection.applyTextDraft(
    previewItem,
    readNodeTextDraft({
      entry: input.entry,
      edit: input.edit
    })
  )

  return input.working.measure({
    kind: 'node',
    nodeId: input.nodeId,
    node: contentItem.node,
    rect: contentItem.rect
  })
}

export const buildNodeView = (input: {
  entry: GraphNodeEntry
  measuredSize?: Size
  treeRect?: Rect
  edit: SessionInput['edit']
}): NodeView => {
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
    base: {
      node: toNodeModel(contentItem.node),
      owner: input.entry.base.owner
    },
    geometry: (() => {
      const outline = nodeApi.outline.geometry(
        contentItem.node,
        contentItem.rect,
        geometry.rotation
      )

      return {
        rotation: geometry.rotation,
        rect: contentItem.rect,
        bounds: outline.bounds,
        outline
      }
    })()
  }
}

export const patchNode = (input: {
  input: Input
  working: WorkingState
  delta: GraphDelta
  nodeId: NodeId
}): {
  changed: boolean
  geometryChanged: boolean
  owner?: OwnerRef
} => {
  const previous = input.working.graph.nodes.get(input.nodeId)
  const entry = readNodeEntry(
    input.input,
    input.working,
    input.working.indexes.ownerByNode,
    input.nodeId
  )
  const owner = entry?.base.owner
  const treeRect = owner?.kind === 'mindmap'
    ? input.working.graph.owners.mindmaps.get(owner.id)?.tree.layout?.node[input.nodeId]
    : undefined
  const measuredSize = entry
    ? readMeasuredNodeSize({
        working: input.working,
        entry,
        nodeId: input.nodeId,
        treeRect,
        edit: input.input.session.edit
      })
    : undefined
  const next = entry
    ? buildNodeView({
        entry,
        measuredSize,
        treeRect,
        edit: input.input.session.edit
      })
    : undefined

  if (next === undefined) {
    if (previous === undefined) {
      return {
        changed: false,
        geometryChanged: false,
        owner
      }
    }

    input.working.graph.nodes.delete(input.nodeId)
    idDelta.remove(input.delta.entities.nodes, input.nodeId)
    input.delta.geometry.nodes.add(input.nodeId)
    return {
      changed: true,
      geometryChanged: true,
      owner
    }
  }

  if (previous === undefined) {
    input.working.graph.nodes.set(input.nodeId, next)
    idDelta.add(input.delta.entities.nodes, input.nodeId)
    input.delta.geometry.nodes.add(input.nodeId)
    return {
      changed: true,
      geometryChanged: true,
      owner: next.base.owner
    }
  }

  if (isNodeViewEqual(previous, next)) {
    return {
      changed: false,
      geometryChanged: false,
      owner: previous.base.owner
    }
  }

  input.working.graph.nodes.set(input.nodeId, next)
  idDelta.update(input.delta.entities.nodes, input.nodeId)

  const geometryChanged = isNodeGeometryChanged(previous, next)
  if (geometryChanged) {
    input.delta.geometry.nodes.add(input.nodeId)
  }

  return {
    changed: true,
    geometryChanged,
    owner: next.base.owner
  }
}
