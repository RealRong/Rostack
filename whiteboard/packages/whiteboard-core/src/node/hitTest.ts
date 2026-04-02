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
}

export type NodeRectHitMatch = NonNullable<NodeRectHitOptions['match']>

export type NodeRectQuery<TEntry extends NodeRectHitEntry> = {
  rect: Rect
  candidateIds: readonly NodeId[]
  match: NodeRectHitMatch
  getEntry: (nodeId: NodeId) => TEntry | undefined
  getDescendants?: (nodeId: NodeId) => readonly NodeId[]
  matchEntry: (
    entry: TEntry,
    rect: Rect,
    match: NodeRectHitMatch
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
  match: NodeRectHitMatch
) => {
  switch (entry.node.type) {
    case 'draw':
      return matchDrawRect({
        node: entry.node,
        rect: entry.rect,
        queryRect: rect,
        mode: match
      })
    default:
      return match === 'contain'
        ? rectContainsRotatedRect(rect, entry.rect, entry.rotation)
        : true
  }
}

export const filterNodeIdsInRect = <TEntry extends NodeRectHitEntry>({
  rect,
  candidateIds,
  match,
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

    if (entry.node.type === 'group' && getDescendants) {
      const descendantIds = getDescendants(nodeId)
      const matched = descendantIds.length > 0 && (
        match === 'contain'
          ? descendantIds.every((descendantId) => matchesCandidate(descendantId))
          : descendantIds.some((descendantId) => matchesCandidate(descendantId))
      )
      matchCache.set(nodeId, matched)
      return matched
    }

    const matched = matchEntry(entry, rect, match)
    matchCache.set(nodeId, matched)
    return matched
  }

  return candidateIds.filter((nodeId) => matchesCandidate(nodeId))
}
