import {
  type MindmapLayoutConfig,
  type MindmapLayout,
  type MindmapId,
  type MindmapNode,
  type MindmapNodeId,
  type MindmapTree
} from './types'
import type {
  MindmapConnectionLine,
  MindmapInsertPlacement,
  MindmapInsertPlan
} from '../types/mindmap'
import { layoutMindmap, layoutMindmapTidy } from './layout'
import {
  createNodeFieldsUpdateOperation,
  createNodeUpdateOperation
} from '../node/update'
import { compileNodeFieldUpdate } from '../schema'
import { getNode } from '../document'
import type {
  Document,
  MindmapLayoutHint,
  Operation,
  Size,
  SpatialNode
} from '../types'
import { cloneValue } from '../value'

const computeConnectionLine = (
  parent: { x: number; y: number; width: number; height: number },
  child: { x: number; y: number; width: number; height: number },
  side?: 'left' | 'right'
) => {
  const parentCenterX = parent.x + parent.width / 2
  const parentCenterY = parent.y + parent.height / 2
  const childCenterY = child.y + child.height / 2
  if (side === 'left') {
    return {
      x1: parent.x,
      y1: parentCenterY,
      x2: child.x + child.width,
      y2: childCenterY
    }
  }
  if (side === 'right') {
    return {
      x1: parent.x + parent.width,
      y1: parentCenterY,
      x2: child.x,
      y2: childCenterY
    }
  }
  const childCenterX = child.x + child.width / 2
  if (childCenterX >= parentCenterX) {
    return {
      x1: parent.x + parent.width,
      y1: parentCenterY,
      x2: child.x,
      y2: childCenterY
    }
  }
  return {
    x1: parent.x,
    y1: parentCenterY,
    x2: child.x + child.width,
    y2: childCenterY
  }
}

export const getSubtreeIds = (tree: MindmapTree, rootId: MindmapNodeId) => {
  const result: MindmapNodeId[] = []
  const stack: MindmapNodeId[] = [rootId]
  const visited = new Set<MindmapNodeId>()
  while (stack.length) {
    const current = stack.pop()!
    if (visited.has(current)) continue
    visited.add(current)
    result.push(current)
    const children = tree.children[current] ?? []
    children.forEach((childId) => stack.push(childId))
  }
  return result
}

export const getSide = (tree: MindmapTree, nodeId: MindmapNodeId): 'left' | 'right' | undefined => {
  if (nodeId === tree.rootId) return
  let current: MindmapNodeId | undefined = nodeId
  while (current) {
    const parent: MindmapNodeId | undefined = tree.nodes[current]?.parentId
    if (!parent) return
    if (parent === tree.rootId) {
      return tree.nodes[current]?.side
    }
    current = parent
  }
}

export const resolveInsertPlan = ({
  tree,
  targetNodeId,
  placement,
  layoutSide,
  defaultSide = 'right'
}: {
  tree: MindmapTree
  targetNodeId: MindmapNodeId
  placement: MindmapInsertPlacement
  layoutSide?: 'left' | 'right' | 'both'
  defaultSide?: 'left' | 'right'
}): MindmapInsertPlan => {
  if (targetNodeId === tree.rootId) {
    const children = tree.children[targetNodeId] ?? []
    const index = placement === 'up' ? 0 : placement === 'down' ? children.length : undefined
    const side =
      placement === 'left'
        ? 'left'
        : placement === 'right'
          ? 'right'
          : layoutSide === 'left' || layoutSide === 'right'
            ? layoutSide
            : defaultSide
    return {
      mode: 'child',
      parentId: targetNodeId,
      index,
      side
    }
  }

  if (placement === 'up' || placement === 'down') {
    return {
      mode: 'sibling',
      nodeId: targetNodeId,
      position: placement === 'up' ? 'before' : 'after'
    }
  }

  const targetSide = getSide(tree, targetNodeId) ?? defaultSide
  const towardRoot =
    (placement === 'left' && targetSide === 'right') || (placement === 'right' && targetSide === 'left')

  if (towardRoot) {
    return {
      mode: 'towardRoot',
      nodeId: targetNodeId
    }
  }

  return {
    mode: 'child',
    parentId: targetNodeId
  }
}

const isMindmapTree = (value: unknown): value is MindmapTree => {
  if (!value || typeof value !== 'object') return false
  const tree = value as MindmapTree
  return typeof tree.rootId === 'string' && typeof tree.nodes === 'object' && typeof tree.children === 'object'
}

export const getMindmapTreeFromNode = (node: SpatialNode | undefined): MindmapTree | undefined => {
  if (!node || node.type !== 'mindmap') return
  const data = node.data as Record<string, unknown> | undefined
  if (!data || typeof data !== 'object') return
  const tree = data.mindmap
  return isMindmapTree(tree) ? tree : undefined
}

export const getMindmapTreeFromDocument = (
  document: Pick<Document, 'nodes'>,
  id: MindmapId
): MindmapTree | undefined => {
  const node = getNode(document, id)
  return node?.type === 'mindmap' ? getMindmapTreeFromNode(node) : undefined
}

export const getMindmapTree = getMindmapTreeFromNode

const normalizeMindmapTree = (
  id: MindmapId,
  tree: MindmapTree
): MindmapTree => (tree.id === id ? tree : { ...tree, id })

const buildMindmapNodeData = (
  data: SpatialNode['data'] | undefined,
  tree: MindmapTree
): SpatialNode['data'] => ({
  ...(data && typeof data === 'object'
    ? data
    : {}),
  mindmap: cloneValue(tree)
})

export const getMindmapLabel = (node: MindmapNode | undefined) => {
  if (!node?.data || typeof node.data !== 'object' || !('kind' in node.data)) return 'mindmap'
  const data = node.data as { kind: string; text?: string; name?: string; title?: string; url?: string }
  switch (data.kind) {
    case 'text':
      return data.text?.trim() ? data.text : 'Text'
    case 'file':
      return data.name?.trim() ? data.name : 'File'
    case 'link':
      return data.title?.trim() ? data.title : data.url ?? 'Link'
    case 'ref':
      return data.title?.trim() ? data.title : 'Ref'
    default:
      return data.kind ?? 'mindmap'
  }
}

export const computeMindmapLayout = (
  tree: MindmapTree,
  nodeSize: Size,
  layout: MindmapLayoutConfig
): MindmapLayout => {
  const mode = layout.mode === 'tidy' ? 'tidy' : 'simple'
  const getNodeSize = () => nodeSize
  const layoutFn = mode === 'tidy' ? layoutMindmapTidy : layoutMindmap
  return layoutFn(tree, getNodeSize, layout.options)
}

const resolveAnchorWorld = ({
  tree,
  hint,
  nodePosition
}: {
  tree: MindmapTree
  hint: MindmapLayoutHint
  nodePosition?: SpatialNode['position']
}) => {
  if (!hint.nodeSize || !nodePosition) return undefined
  const layout = computeMindmapLayout(tree, hint.nodeSize, {
    mode: hint.mode,
    options: hint.options
  })
  const anchorId = hint.anchorId ?? tree.rootId
  const rect = layout.node[anchorId]
  if (!rect) return undefined
  const shiftX = -layout.bbox.x
  const shiftY = -layout.bbox.y
  return {
    x: nodePosition.x + rect.x + shiftX + rect.width / 2,
    y: nodePosition.y + rect.y + shiftY + rect.height / 2
  }
}

const resolveAnchorPatch = ({
  beforeTree,
  afterTree,
  hint,
  nodePosition,
  threshold = 0.5
}: {
  beforeTree: MindmapTree
  afterTree: MindmapTree
  hint?: MindmapLayoutHint
  nodePosition?: SpatialNode['position']
  threshold?: number
}): { position: SpatialNode['position'] } | undefined => {
  if (!hint?.nodeSize || !hint.anchorId || !nodePosition) return undefined
  const before = resolveAnchorWorld({ tree: beforeTree, hint, nodePosition })
  const after = resolveAnchorWorld({ tree: afterTree, hint, nodePosition })
  if (!before || !after) return undefined
  const dx = before.x - after.x
  const dy = before.y - after.y
  if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return undefined
  return {
    position: {
      x: nodePosition.x + dx,
      y: nodePosition.y + dy
    }
  }
}

export const createMindmapCreateOp = ({
  id,
  tree
}: {
  id: MindmapId
  tree: MindmapTree
}): Operation => ({
  type: 'node.create',
  node: {
    id,
    type: 'mindmap',
    position: cloneValue(tree.meta?.position ?? { x: 0, y: 0 }),
    data: buildMindmapNodeData(undefined, normalizeMindmapTree(id, tree))
  }
})

export const createMindmapDeleteOps = (ids: readonly MindmapId[]): Operation[] =>
  ids.map((id) => ({
    type: 'node.delete',
    id
  }))

export const createMindmapUpdateOps = ({
  beforeTree,
  afterTree,
  hint,
  node
}: {
  beforeTree: MindmapTree
  afterTree: MindmapTree
  hint?: MindmapLayoutHint
  node: SpatialNode
}): Operation[] => {
  const nextTree = normalizeMindmapTree(node.id, afterTree)
  const operations: Operation[] = [createNodeUpdateOperation(
    node.id,
    compileNodeFieldUpdate(
      { scope: 'data', path: 'mindmap' },
      cloneValue(nextTree)
    )
  )]

  const anchorPatch = resolveAnchorPatch({
    beforeTree,
    afterTree: nextTree,
    hint,
    nodePosition: node.position
  })
  if (!anchorPatch) return operations

  return [
    ...operations,
    createNodeFieldsUpdateOperation(node.id, anchorPatch)
  ]
}

export const buildMindmapLines = (
  tree: MindmapTree,
  computed: MindmapLayout
): MindmapConnectionLine[] => {
  const result: MindmapConnectionLine[] = []
  Object.entries(tree.children).forEach(([parentId, childIds]) => {
    const parent = computed.node[parentId]
    if (!parent) return
    childIds.forEach((childId) => {
      const child = computed.node[childId]
      if (!child) return
      const side = parentId === tree.rootId ? tree.nodes[childId]?.side : undefined
      const line = computeConnectionLine(parent, child, side)
      result.push({
        id: `${parentId}-${childId}`,
        x1: line.x1,
        y1: line.y1,
        x2: line.x2,
        y2: line.y2
      })
    })
  })
  return result
}
