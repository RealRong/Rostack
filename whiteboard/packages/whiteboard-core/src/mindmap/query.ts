import {
  type GetNodeSize,
  type MindmapLayout,
  type MindmapLayoutSpec,
  type MindmapNodeId,
  type MindmapTree,
  type MindmapTreeNode
} from '@whiteboard/core/mindmap/types'
import type {
  MindmapInsertPlacement,
  MindmapInsertPlan
} from '@whiteboard/core/types/mindmap'
import { layoutMindmap, layoutMindmapTidy } from '@whiteboard/core/mindmap/layout'
import { getNode } from '@whiteboard/core/document'
import type {
  Document,
  Operation,
  SpatialNode
} from '@whiteboard/core/types'
import { cloneValue } from '@whiteboard/core/value'

const resolveMindmapLayoutSpec = (
  tree: MindmapTree,
  layout?: Partial<MindmapLayoutSpec>
): MindmapLayoutSpec => ({
  mode: layout?.mode ?? tree.layout.mode,
  side: layout?.side ?? tree.layout.side,
  hGap: layout?.hGap ?? tree.layout.hGap,
  vGap: layout?.vGap ?? tree.layout.vGap
})

export const getSubtreeIds = (
  tree: MindmapTree,
  rootId: MindmapNodeId
) => {
  const result: MindmapNodeId[] = []
  const stack: MindmapNodeId[] = [rootId]
  const visited = new Set<MindmapNodeId>()
  while (stack.length) {
    const current = stack.pop()!
    if (visited.has(current)) continue
    visited.add(current)
    result.push(current)
    ;(tree.children[current] ?? []).forEach((childId) => stack.push(childId))
  }
  return result
}

export const getSide = (
  tree: MindmapTree,
  nodeId: MindmapNodeId
): 'left' | 'right' | undefined => {
  if (nodeId === tree.rootNodeId) return undefined
  let current: MindmapNodeId | undefined = nodeId
  while (current) {
    const parent: MindmapNodeId | undefined = tree.nodes[current]?.parentId
    if (!parent) return undefined
    if (parent === tree.rootNodeId) {
      return tree.nodes[current]?.side
    }
    current = parent
  }
  return undefined
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
  if (targetNodeId === tree.rootNodeId) {
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
    (placement === 'left' && targetSide === 'right')
    || (placement === 'right' && targetSide === 'left')

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

const isMindmapTreeNode = (
  value: unknown
): value is MindmapTreeNode => (
  Boolean(value)
  && typeof value === 'object'
  && typeof (value as MindmapTreeNode).branch === 'object'
)

const isMindmapTree = (
  value: unknown
): value is MindmapTree => {
  if (!value || typeof value !== 'object') return false
  const tree = value as MindmapTree
  return (
    typeof tree.rootNodeId === 'string'
    && typeof tree.nodes === 'object'
    && typeof tree.children === 'object'
    && typeof tree.layout === 'object'
    && Object.values(tree.nodes).every(isMindmapTreeNode)
  )
}

export const getMindmapTreeFromNode = (
  node: SpatialNode | undefined
): MindmapTree | undefined => {
  if (!node || node.type !== 'mindmap') return undefined
  return isMindmapTree(node.data) ? node.data : undefined
}

export const getMindmapTreeFromDocument = (
  document: Pick<Document, 'nodes'>,
  id: string
): MindmapTree | undefined => {
  const node = getNode(document, id)
  return node?.type === 'mindmap' ? getMindmapTreeFromNode(node) : undefined
}

export const getMindmapTree = getMindmapTreeFromNode

export const computeMindmapLayout = (
  tree: MindmapTree,
  getNodeSize: GetNodeSize,
  layout?: Partial<MindmapLayoutSpec>
): MindmapLayout => {
  const resolvedLayout = resolveMindmapLayoutSpec(tree, layout)
  const layoutFn = resolvedLayout.mode === 'tidy'
    ? layoutMindmapTidy
    : layoutMindmap
  return layoutFn(tree, getNodeSize, resolvedLayout)
}

export const createMindmapCreateOp = ({
  id,
  tree,
  position = {
    x: 0,
    y: 0
  }
}: {
  id: string
  tree: MindmapTree
  position?: SpatialNode['position']
}): Operation => ({
  type: 'node.create',
  node: {
    id,
    type: 'mindmap',
    position: cloneValue(position),
    data: cloneValue(tree) as unknown as SpatialNode['data']
  }
})
