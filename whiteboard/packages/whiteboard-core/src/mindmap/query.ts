import { json } from '@shared/core'
import {
  type GetNodeSize,
  type MindmapLayout,
  type MindmapLayoutSpec,
  type MindmapNodeId,
  type MindmapRecord,
  type MindmapTree,
  type MindmapTreeNode
} from '@whiteboard/core/mindmap/types'
import type {
  MindmapInsertPlacement,
  MindmapInsertPlan
} from '@whiteboard/core/types/mindmap'
import { layoutMindmap, layoutMindmapTidy } from '@whiteboard/core/mindmap/layout'
import { document as documentApi } from '@whiteboard/core/document'
import type {
  Document,
  MindmapCreateInput,
  Node,
  NodeId,
  Operation,
  Point
} from '@whiteboard/core/types'

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

export const toMindmapTree = (
  record: MindmapRecord
): MindmapTree => {
  const nodes: Record<MindmapNodeId, MindmapTreeNode> = {}
  Object.entries(record.members).forEach(([id, member]) => {
    nodes[id] = {
      parentId: member.parentId,
      side: member.side,
      collapsed: member.collapsed,
      branch: json.clone(member.branchStyle)
    }
  })

  return {
    rootNodeId: record.root,
    nodes,
    children: json.clone(record.children),
    layout: json.clone(record.layout),
    meta: json.clone(record.meta)
  }
}

export const getMindmapIdByNode = (
  node: Pick<Node, 'owner'> | undefined
): string | undefined => (
  node?.owner?.kind === 'mindmap'
    ? node.owner.id
    : undefined
)

export const getMindmapRecordByNodeId = (
  document: Pick<Document, 'nodes' | 'mindmaps'>,
  nodeId: NodeId
): MindmapRecord | undefined => {
  const node = documentApi.read.node(document, nodeId)
  const mindmapId = getMindmapIdByNode(node)
  if (!mindmapId) return undefined
  return documentApi.read.mindmap(document, mindmapId)
}

export const getMindmapTreeFromDocument = (
  document: Pick<Document, 'nodes' | 'mindmaps'>,
  id: string
): MindmapTree | undefined => {
  const direct = documentApi.read.mindmap(document, id)
  if (direct) {
    return toMindmapTree(direct)
  }

  const byNode = getMindmapRecordByNodeId(document, id)
  return byNode ? toMindmapTree(byNode) : undefined
}

export const getMindmapTree = (
  record: MindmapRecord | undefined
): MindmapTree | undefined => (
  record
    ? toMindmapTree(record)
    : undefined
)

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
  position?: Point
}): Operation => ({
  type: 'mindmap.create',
  mindmap: {
    id,
    root: tree.rootNodeId,
    members: Object.fromEntries(
      Object.entries(tree.nodes).map(([nodeId, node]) => [
        nodeId,
        {
          parentId: node.parentId,
          side: node.side,
          collapsed: node.collapsed,
          branchStyle: json.clone(node.branch)
        }
      ])
    ),
    children: json.clone(tree.children),
    layout: json.clone(tree.layout),
    meta: json.clone(tree.meta)
  },
  nodes: [
    {
      id: tree.rootNodeId,
      type: 'text',
      owner: {
        kind: 'mindmap',
        id
      },
      position: json.clone(position)
    }
  ]
})
