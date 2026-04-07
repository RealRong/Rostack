import type { Node, NodeId, NodeType, Rect } from '../types'
import {
  rectContainsRotatedRect,
  rectIntersectsRotatedRect
} from '../geometry'
import { matchDrawRect } from './draw'

export type NodeRectHitEntry = {
  node: {
    id: NodeId
    type: NodeType
  }
  rect: Rect
  rotation: number
}

export type NodeRectMatchEntry = {
  node: Node
  rect: Rect
  rotation: number
}

export type NodeRectHitOptions = {
  match?: 'touch' | 'contain'
  exclude?: readonly NodeId[]
  policy?: 'default' | 'selection-marquee'
}

export type NodeRectHitMatch = NonNullable<NodeRectHitOptions['match']>
export type NodeRectHitPolicy = NonNullable<NodeRectHitOptions['policy']>

export type NodeRectQuery<TEntry extends NodeRectHitEntry> = {
  rect: Rect
  candidateIds: readonly NodeId[]
  match: NodeRectHitMatch
  policy: NodeRectHitPolicy
  getEntry: (nodeId: NodeId) => TEntry | undefined
  getDescendants?: (nodeId: NodeId) => readonly NodeId[]
  matchEntry: (
    entry: TEntry,
    rect: Rect,
    match: NodeRectHitMatch,
    policy: NodeRectHitPolicy
  ) => boolean
}

export const getNodeIdsInRect = (
  rect: Rect,
  entries: NodeRectHitEntry[],
  options?: NodeRectHitOptions
): NodeId[] => {
  const match = options?.match ?? 'touch'
  const exclude = options?.exclude?.length
    ? new Set(options.exclude)
    : undefined

  return entries
    .filter((entry) => {
      if (exclude?.has(entry.node.id)) {
        return false
      }

      return match === 'contain'
        ? rectContainsRotatedRect(rect, entry.rect, entry.rotation)
        : rectIntersectsRotatedRect(rect, entry.rect, entry.rotation)
    })
    .map((entry) => entry.node.id)
}

export const matchCanvasNodeRect = (
  entry: NodeRectMatchEntry,
  rect: Rect,
  match: NodeRectHitMatch,
  policy: NodeRectHitPolicy
) => {
  const effectiveMatch =
    policy === 'selection-marquee'
    && entry.node.type === 'frame'
    && match === 'touch'
      ? 'contain'
      : match

  switch (entry.node.type) {
    case 'draw':
      return matchDrawRect({
        node: entry.node,
        rect: entry.rect,
        queryRect: rect,
        mode: effectiveMatch
      })
    default:
      return effectiveMatch === 'contain'
        ? rectContainsRotatedRect(rect, entry.rect, entry.rotation)
        : true
  }
}

export const filterNodeIdsInRect = <TEntry extends NodeRectHitEntry>({
  rect,
  candidateIds,
  match,
  policy,
  getEntry,
  getDescendants,
  matchEntry
}: NodeRectQuery<TEntry>): NodeId[] => {
  const candidateSet = new Set(candidateIds)
  const matchCache = new Map<NodeId, boolean>()

  const matchesCandidate = (
    nodeId: NodeId
  ): boolean => {
    const cached = matchCache.get(nodeId)
    if (cached !== undefined) {
      return cached
    }

    if (!candidateSet.has(nodeId)) {
      matchCache.set(nodeId, false)
      return false
    }

    const entry = getEntry(nodeId)
    if (!entry) {
      matchCache.set(nodeId, false)
      return false
    }

    const matched = matchEntry(entry, rect, match, policy)
    matchCache.set(nodeId, matched)
    return matched
  }

  return candidateIds.filter((nodeId) => matchesCandidate(nodeId))
}
