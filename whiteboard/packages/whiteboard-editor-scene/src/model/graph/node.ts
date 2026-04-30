import { equal } from '@shared/core'
import { node as nodeApi } from '@whiteboard/core/node'
import type {
  Node,
  NodeId,
  NodeModel,
  Rect,
  Size
} from '@whiteboard/core/types'
import type { GraphPhaseDelta } from '../../contracts/delta'
import type {
  Input,
  NodeDraftMeasure,
  NodePreview,
  OwnerRef,
  SessionInput,
  NodeView
} from '../../contracts/editor'
import type {
  GraphNodeEntry,
  WorkingState
} from '../../contracts/working'
import { applyEntity } from '@shared/projection'

const EMPTY_SIZE: Size = {
  width: 0,
  height: 0
}

const nodeModelCache = new WeakMap<Node, NodeModel>()

const readNodePatch = (
  preview?: NodePreview
) => preview?.patch

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
  draftMeasure?: NodeDraftMeasure
}) => {
  const { edit, entry, draftMeasure } = input
  if (!edit || edit.kind !== 'node' || edit.nodeId !== entry.base.node.id) {
    return undefined
  }

  return {
    field: edit.field,
    value: edit.text,
    size:
      edit.field === 'text'
      && draftMeasure?.kind === 'size'
        ? draftMeasure.size
        : undefined,
    fontSize:
      edit.field === 'text'
      && entry.base.node.type === 'sticky'
      && draftMeasure?.kind === 'fit'
        ? draftMeasure.fontSize
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

export const isNodeDraftMeasureEqual = (
  left: NodeDraftMeasure | undefined,
  right: NodeDraftMeasure | undefined
): boolean => left === right || (
  left !== undefined
  && right !== undefined
  && left.kind === right.kind
  && (
    left.kind === 'size' && right.kind === 'size'
      ? left.size.width === right.size.width
        && left.size.height === right.size.height
      : left.kind === 'fit' && right.kind === 'fit'
        ? left.fontSize === right.fontSize
        : false
  )
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
    preview: input.runtime.session.preview.nodes.get(nodeId)
  }
}

export const readProjectedNodeRotation = (
  entry: GraphNodeEntry
): number => {
  const patch = readNodePatch(entry.preview)
  return patch?.rotation ?? entry.base.node.rotation ?? 0
}

export const readProjectedNodeSize = (input: {
  entry: GraphNodeEntry
  draftMeasure?: NodeDraftMeasure
}): Size => {
  const patch = readNodePatch(input.entry.preview)

  return patch?.size
    ?? (
      input.draftMeasure?.kind === 'size'
        ? input.draftMeasure.size
        : undefined
    )
    ?? readNodeSize(input.entry.base.node)
}

export const readProjectedNodeRect = (input: {
  entry: GraphNodeEntry
  draftMeasure?: NodeDraftMeasure
  treeRect?: Rect
}): Rect => {
  if (input.treeRect) {
    return input.treeRect
  }

  const patch = readNodePatch(input.entry.preview)
  const position = patch?.position ?? input.entry.base.node.position
  const size = readProjectedNodeSize({
    entry: input.entry,
    draftMeasure: input.draftMeasure
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
  draftMeasure?: NodeDraftMeasure
  treeRect?: Rect
}) => {
  const rect = readProjectedNodeRect(input)
  const rotation = readProjectedNodeRotation(input.entry)

  return {
    rect,
    rotation
  }
}

export const readNodeDraftMeasure = (input: {
  working: WorkingState
  entry: GraphNodeEntry
  nodeId: NodeId
  treeRect?: Rect
  edit: SessionInput['edit']
}): NodeDraftMeasure | undefined => {
  if (
    !input.working.layout
    || input.edit?.kind !== 'node'
    || input.edit.nodeId !== input.nodeId
  ) {
    return undefined
  }

  const patch = readNodePatch(input.entry.preview)
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
  return input.working.layout.runtime({
    kind: 'node.draft',
    nodeId: input.nodeId,
    node: input.entry.base.node,
    rect: fallbackRect,
    preview: input.entry.preview?.patch,
    draft: {
      field: input.edit.field,
      value: input.edit.text
    }
  }).measure
}

export const buildNodeView = (input: {
  entry: GraphNodeEntry
  draftMeasure?: NodeDraftMeasure
  treeRect?: Rect
  edit: SessionInput['edit']
}): NodeView => {
  const geometry = buildProjectedNodeGeometry(input)
  const previewItem = nodeApi.patch.applyTextPreview({
    node: input.entry.base.node,
    rect: geometry.rect
  }, input.entry.preview?.patch)
  const contentItem = nodeApi.patch.applyTextDraft(
    previewItem,
    readNodeTextDraft({
      entry: input.entry,
      edit: input.edit,
      draftMeasure: input.draftMeasure
    })
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
  delta: GraphPhaseDelta
  nodeId: NodeId
}): {
  changed: boolean
  geometryChanged: boolean
  owner?: OwnerRef
} => {
  const previous = input.working.graph.nodes.get(input.nodeId)
  const previousDraft = input.working.draft.node.get(input.nodeId)
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
  const draftMeasure = entry
    ? readNodeDraftMeasure({
        working: input.working,
        entry,
        nodeId: input.nodeId,
        treeRect,
        edit: input.input.runtime.session.edit
      })
    : undefined
  const next = entry
    ? buildNodeView({
        entry,
        draftMeasure,
        treeRect,
        edit: input.input.runtime.session.edit
      })
    : undefined

  if (draftMeasure) {
    input.working.draft.node.set(input.nodeId, draftMeasure)
  } else {
    input.working.draft.node.delete(input.nodeId)
  }

  if (
    next !== undefined
    && previous !== undefined
    && isNodeViewEqual(previous, next)
    && isNodeDraftMeasureEqual(previousDraft, draftMeasure)
  ) {
    return {
      changed: false,
      geometryChanged: false,
      owner: previous.base.owner
    }
  }

  const result = applyEntity({
    id: input.nodeId,
    previous,
    next,
    equal: isNodeViewEqual,
    geometryChanged: isNodeGeometryChanged,
    write: (value) => {
      if (value === undefined) {
        input.working.graph.nodes.delete(input.nodeId)
        return
      }

      input.working.graph.nodes.set(input.nodeId, value)
    },
    entityDelta: input.delta.entities.nodes,
    geometryDelta: input.delta.geometry.nodes
  })

  return {
    ...result,
    owner: next?.base.owner ?? owner
  }
}
