import {
  json
} from '@shared/core'
import {
  path as mutationPath,
  type Path
} from '@shared/draft'
import type {
  EdgeField,
  EdgeId,
  EdgeLabelField,
  GroupField,
  GroupId,
  MindmapBranchField,
  MindmapId,
  NodeField,
  NodeId
} from '@whiteboard/core/types'

export type HistoryKey =
  | { kind: 'document.background' }
  | { kind: 'canvas.order' }
  | { kind: 'node.exists'; nodeId: NodeId }
  | { kind: 'node.field'; nodeId: NodeId; field: NodeField }
  | { kind: 'node.record'; nodeId: NodeId; scope: 'data' | 'style'; path: Path }
  | { kind: 'edge.exists'; edgeId: EdgeId }
  | { kind: 'edge.field'; edgeId: EdgeId; field: EdgeField }
  | { kind: 'edge.record'; edgeId: EdgeId; scope: 'data' | 'style'; path: Path }
  | { kind: 'edge.labels'; edgeId: EdgeId }
  | { kind: 'edge.label.exists'; edgeId: EdgeId; labelId: string }
  | { kind: 'edge.label.field'; edgeId: EdgeId; labelId: string; field: EdgeLabelField }
  | { kind: 'edge.label.record'; edgeId: EdgeId; labelId: string; scope: 'data' | 'style'; path: Path }
  | { kind: 'edge.route'; edgeId: EdgeId }
  | { kind: 'edge.route.point'; edgeId: EdgeId; pointId: string }
  | { kind: 'group.exists'; groupId: GroupId }
  | { kind: 'group.field'; groupId: GroupId; field: GroupField }
  | { kind: 'mindmap.exists'; mindmapId: MindmapId }
  | { kind: 'mindmap.structure'; mindmapId: MindmapId }
  | { kind: 'mindmap.layout'; mindmapId: MindmapId }
  | { kind: 'mindmap.branch.field'; mindmapId: MindmapId; topicId: NodeId; field: MindmapBranchField }

export type HistoryFootprint = readonly HistoryKey[]

export interface HistoryKeyCollector {
  add(key: HistoryKey): void
  addMany(keys: Iterable<HistoryKey>): void
  has(key: HistoryKey): boolean
  finish(): HistoryFootprint
  clear(): void
}

const isRecord = (
  value: unknown
): value is Record<string, unknown> => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
)

const readString = (
  value: unknown
): string | undefined => typeof value === 'string'
  ? value
  : undefined

const isPath = (
  value: unknown
): value is Path => Array.isArray(value)
  && value.every((entry) => typeof entry === 'string' || typeof entry === 'number')

const pathsOverlap = (
  left: Path,
  right: Path
): boolean => mutationPath.overlaps(left, right)

const isNodeKey = (
  key: HistoryKey
): key is Extract<HistoryKey, { kind: `node.${string}` }> => key.kind.startsWith('node.')

const isEdgeKey = (
  key: HistoryKey
): key is Extract<HistoryKey, { kind: `edge.${string}` }> => key.kind.startsWith('edge.')

const isGroupKey = (
  key: HistoryKey
): key is Extract<HistoryKey, { kind: `group.${string}` }> => key.kind.startsWith('group.')

const isMindmapKey = (
  key: HistoryKey
): key is Extract<HistoryKey, { kind: `mindmap.${string}` }> => key.kind.startsWith('mindmap.')

export const serializeHistoryKey = (
  key: HistoryKey
): string => json.stableStringify(key)

export const createHistoryKeyCollector = (): HistoryKeyCollector => {
  const byKey = new Map<string, HistoryKey>()

  const add = (
    key: HistoryKey
  ) => {
    byKey.set(serializeHistoryKey(key), key)
  }

  return {
    add,
    addMany: (keys) => {
      for (const key of keys) {
        add(key)
      }
    },
    has: (key) => byKey.has(serializeHistoryKey(key)),
    finish: () => [...byKey.values()],
    clear: () => {
      byKey.clear()
    }
  }
}

export const isHistoryKey = (
  value: unknown
): value is HistoryKey => {
  if (!isRecord(value)) {
    return false
  }

  switch (value.kind) {
    case 'document.background':
    case 'canvas.order':
      return true
    case 'node.exists':
      return readString(value.nodeId) !== undefined
    case 'node.field':
      return readString(value.nodeId) !== undefined && readString(value.field) !== undefined
    case 'node.record':
      return (
        readString(value.nodeId) !== undefined
        && (value.scope === 'data' || value.scope === 'style')
        && isPath(value.path)
      )
    case 'edge.exists':
      return readString(value.edgeId) !== undefined
    case 'edge.field':
      return readString(value.edgeId) !== undefined && readString(value.field) !== undefined
    case 'edge.record':
      return (
        readString(value.edgeId) !== undefined
        && (value.scope === 'data' || value.scope === 'style')
        && isPath(value.path)
      )
    case 'edge.labels':
      return readString(value.edgeId) !== undefined
    case 'edge.label.exists':
      return readString(value.edgeId) !== undefined && readString(value.labelId) !== undefined
    case 'edge.label.field':
      return (
        readString(value.edgeId) !== undefined
        && readString(value.labelId) !== undefined
        && readString(value.field) !== undefined
      )
    case 'edge.label.record':
      return (
        readString(value.edgeId) !== undefined
        && readString(value.labelId) !== undefined
        && (value.scope === 'data' || value.scope === 'style')
        && isPath(value.path)
      )
    case 'edge.route':
      return readString(value.edgeId) !== undefined
    case 'edge.route.point':
      return readString(value.edgeId) !== undefined && readString(value.pointId) !== undefined
    case 'group.exists':
      return readString(value.groupId) !== undefined
    case 'group.field':
      return readString(value.groupId) !== undefined && readString(value.field) !== undefined
    case 'mindmap.exists':
    case 'mindmap.structure':
    case 'mindmap.layout':
      return readString(value.mindmapId) !== undefined
    case 'mindmap.branch.field':
      return (
        readString(value.mindmapId) !== undefined
        && readString(value.topicId) !== undefined
        && readString(value.field) !== undefined
      )
    default:
      return false
  }
}

export const assertHistoryFootprint = (
  value: unknown
): HistoryFootprint => {
  if (!Array.isArray(value)) {
    throw new Error('History footprint must be an array.')
  }

  value.forEach((entry) => {
    if (!isHistoryKey(entry)) {
      throw new Error('History key is invalid.')
    }
  })

  return value
}

export const historyKeyConflicts = (
  left: HistoryKey,
  right: HistoryKey
): boolean => {
  if (left.kind === right.kind) {
    switch (left.kind) {
      case 'document.background':
      case 'canvas.order':
        return true
      case 'node.exists': {
        const next = right as typeof left
        return left.nodeId === next.nodeId
      }
      case 'node.field': {
        const next = right as typeof left
        return left.nodeId === next.nodeId && left.field === next.field
      }
      case 'node.record': {
        const next = right as typeof left
        return (
          left.nodeId === next.nodeId
          && left.scope === next.scope
          && pathsOverlap(left.path, next.path)
        )
      }
      case 'edge.exists': {
        const next = right as typeof left
        return left.edgeId === next.edgeId
      }
      case 'edge.field': {
        const next = right as typeof left
        return left.edgeId === next.edgeId && left.field === next.field
      }
      case 'edge.record': {
        const next = right as typeof left
        return (
          left.edgeId === next.edgeId
          && left.scope === next.scope
          && pathsOverlap(left.path, next.path)
        )
      }
      case 'edge.labels': {
        const next = right as typeof left
        return left.edgeId === next.edgeId
      }
      case 'edge.label.exists': {
        const next = right as typeof left
        return left.edgeId === next.edgeId && left.labelId === next.labelId
      }
      case 'edge.label.field': {
        const next = right as typeof left
        return (
          left.edgeId === next.edgeId
          && left.labelId === next.labelId
          && left.field === next.field
        )
      }
      case 'edge.label.record': {
        const next = right as typeof left
        return (
          left.edgeId === next.edgeId
          && left.labelId === next.labelId
          && left.scope === next.scope
          && pathsOverlap(left.path, next.path)
        )
      }
      case 'edge.route': {
        const next = right as typeof left
        return left.edgeId === next.edgeId
      }
      case 'edge.route.point': {
        const next = right as typeof left
        return left.edgeId === next.edgeId && left.pointId === next.pointId
      }
      case 'group.exists': {
        const next = right as typeof left
        return left.groupId === next.groupId
      }
      case 'group.field': {
        const next = right as typeof left
        return left.groupId === next.groupId && left.field === next.field
      }
      case 'mindmap.exists':
      case 'mindmap.structure':
      case 'mindmap.layout': {
        const next = right as typeof left
        return left.mindmapId === next.mindmapId
      }
      case 'mindmap.branch.field': {
        const next = right as typeof left
        return (
          left.mindmapId === next.mindmapId
          && left.topicId === next.topicId
          && left.field === next.field
        )
      }
    }
  }

  if (left.kind === 'node.exists' && isNodeKey(right)) {
    return right.nodeId === left.nodeId
  }
  if (right.kind === 'node.exists' && isNodeKey(left)) {
    return left.nodeId === right.nodeId
  }

  if (left.kind === 'edge.exists' && isEdgeKey(right)) {
    return right.edgeId === left.edgeId
  }
  if (right.kind === 'edge.exists' && isEdgeKey(left)) {
    return left.edgeId === right.edgeId
  }

  if (left.kind === 'group.exists' && isGroupKey(right)) {
    return right.groupId === left.groupId
  }
  if (right.kind === 'group.exists' && isGroupKey(left)) {
    return left.groupId === right.groupId
  }

  if (left.kind === 'mindmap.exists' && isMindmapKey(right)) {
    return right.mindmapId === left.mindmapId
  }
  if (right.kind === 'mindmap.exists' && isMindmapKey(left)) {
    return left.mindmapId === right.mindmapId
  }

  if (left.kind === 'edge.labels') {
    return (
      (right.kind === 'edge.label.exists'
        || right.kind === 'edge.label.field'
        || right.kind === 'edge.label.record')
      && right.edgeId === left.edgeId
    )
  }
  if (right.kind === 'edge.labels') {
    return (
      (left.kind === 'edge.label.exists'
        || left.kind === 'edge.label.field'
        || left.kind === 'edge.label.record')
      && left.edgeId === right.edgeId
    )
  }

  if (left.kind === 'edge.route' && right.kind === 'edge.route.point') {
    return left.edgeId === right.edgeId
  }
  if (right.kind === 'edge.route' && left.kind === 'edge.route.point') {
    return left.edgeId === right.edgeId
  }

  if (left.kind === 'node.record' && right.kind === 'node.record') {
    return (
      left.nodeId === right.nodeId
      && left.scope === right.scope
      && pathsOverlap(left.path, right.path)
    )
  }
  if (left.kind === 'edge.record' && right.kind === 'edge.record') {
    return (
      left.edgeId === right.edgeId
      && left.scope === right.scope
      && pathsOverlap(left.path, right.path)
    )
  }
  if (left.kind === 'edge.label.record' && right.kind === 'edge.label.record') {
    return (
      left.edgeId === right.edgeId
      && left.labelId === right.labelId
      && left.scope === right.scope
      && pathsOverlap(left.path, right.path)
    )
  }

  return false
}

export const historyFootprintConflicts = (
  left: HistoryFootprint,
  right: HistoryFootprint
): boolean => {
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      if (historyKeyConflicts(left[leftIndex]!, right[rightIndex]!)) {
        return true
      }
    }
  }

  return false
}
