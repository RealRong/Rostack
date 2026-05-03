import { entityTable, type EntityTable } from '@shared/core'
import type {
  MutationSequenceAnchor,
  MutationTreeInsertInput,
  MutationTreeMoveInput,
} from '@shared/mutation'
import type {
  MindmapId,
  MindmapRecord,
} from '@whiteboard/core/mindmap/types'
import type {
  CanvasItemRef,
  Document,
  DocumentPatch,
  Edge,
  EdgeId,
  EdgeLabel,
  EdgePatch,
  EdgeRoutePoint,
  Group,
  GroupId,
  Node,
  NodeId,
} from '@whiteboard/core/types'
import type {
  WhiteboardMutationEdgeValue,
  WhiteboardMutationGroupValue,
  WhiteboardMutationMindmapValue,
  WhiteboardMutationNodeValue,
  WhiteboardMutationWriterBase,
} from './model'
import {
  canvasRefKey,
  parseCanvasRefKey,
  type WhiteboardMindmapTreeValue,
} from './support'

const toNodeValue = (
  node: Node
): WhiteboardMutationNodeValue => ({
  type: node.type,
  position: node.position,
  size: node.size,
  rotation: node.rotation,
  groupId: node.groupId,
  owner: node.owner,
  locked: node.locked,
  data: node.data,
  style: node.style,
})

const toEdgeValue = (
  edge: Edge
): WhiteboardMutationEdgeValue => ({
  source: edge.source,
  target: edge.target,
  type: edge.type,
  locked: edge.locked,
  groupId: edge.groupId,
  textMode: edge.textMode,
  style: edge.style,
  data: edge.data,
  labels: edge.labels,
  points: edge.points
})

const toEdgePoints = (
  points: EdgePatch['points'] | Edge['points']
): Edge['points'] | undefined => Array.isArray(points)
  ? entityTable.normalize.list(points.map((point, index) => ({
      id: `route-point-${index}`,
      x: point.x,
      y: point.y
    })))
  : points
    ? entityTable.normalize.table(points)
    : undefined

const toGroupValue = (
  group: Group
): WhiteboardMutationGroupValue => ({
  locked: group.locked,
  name: group.name,
})

const toMindmapValue = (
  mindmap: MindmapRecord
): WhiteboardMutationMindmapValue => ({
  layout: mindmap.layout,
  tree: mindmap.tree
})

const moveItems = (input: {
  order: readonly CanvasItemRef[]
  moved: readonly CanvasItemRef[]
  anchor?: MutationSequenceAnchor
}): readonly CanvasItemRef[] => {
  const movedSet = new Set(input.moved.map(canvasRefKey))
  const filtered = input.order.filter((ref) => !movedSet.has(canvasRefKey(ref)))
  const insertIndex = (() => {
    const anchor = input.anchor
    if (!anchor) {
      return filtered.length
    }
    if ('at' in anchor) {
      return anchor.at === 'start'
        ? 0
        : filtered.length
    }
    if ('before' in anchor) {
      const index = filtered.findIndex((ref) => canvasRefKey(ref) === anchor.before)
      return index >= 0
        ? index
        : filtered.length
    }
    const index = filtered.findIndex((ref) => canvasRefKey(ref) === anchor.after)
    return index >= 0
      ? index + 1
      : filtered.length
  })()

  return [
    ...filtered.slice(0, insertIndex),
    ...input.moved,
    ...filtered.slice(insertIndex)
  ]
}

const normalizeSequenceAnchor = (
  anchor?: MutationSequenceAnchor | {
    kind: 'start' | 'end' | 'before' | 'after'
    itemId?: string
  }
): MutationSequenceAnchor | undefined => {
  if (!anchor) {
    return undefined
  }
  if ('at' in anchor || 'before' in anchor || 'after' in anchor) {
    return anchor
  }
  if (anchor.kind === 'start') {
    return {
      at: 'start'
    }
  }
  if (anchor.kind === 'end') {
    return {
      at: 'end'
    }
  }
  if (anchor.kind === 'before' && anchor.itemId) {
    return {
      before: anchor.itemId
    }
  }
  if (anchor.kind === 'after' && anchor.itemId) {
    return {
      after: anchor.itemId
    }
  }
  return undefined
}

const EMPTY_EDGE_LABEL_TABLE: EntityTable<string, EdgeLabel> = {
  ids: [],
  byId: {}
}

const EMPTY_EDGE_ROUTE_POINT_TABLE: EntityTable<string, EdgeRoutePoint> = {
  ids: [],
  byId: {}
}

const moveOrderedIds = (
  ids: readonly string[],
  movedIds: readonly string[],
  anchor?: MutationSequenceAnchor
): string[] => {
  const movedSet = new Set(movedIds)
  const filtered = ids.filter((id) => !movedSet.has(id))
  const insertIndex = (() => {
    if (!anchor) {
      return filtered.length
    }
    if ('at' in anchor) {
      return anchor.at === 'start'
        ? 0
        : filtered.length
    }
    if ('before' in anchor) {
      const index = filtered.indexOf(anchor.before)
      return index >= 0
        ? index
        : filtered.length
    }
    const index = filtered.indexOf(anchor.after)
    return index >= 0
      ? index + 1
      : filtered.length
  })()

  return [
    ...filtered.slice(0, insertIndex),
    ...movedIds,
    ...filtered.slice(insertIndex)
  ]
}

const readEdgeLabelTable = (
  edge: Edge | undefined
): EntityTable<string, EdgeLabel> => edge?.labels
  ? entityTable.normalize.table(edge.labels)
  : EMPTY_EDGE_LABEL_TABLE

const readEdgePointTable = (
  edge: Edge | undefined
): EntityTable<string, EdgeRoutePoint> => edge?.points
  ? entityTable.normalize.table(edge.points)
  : EMPTY_EDGE_ROUTE_POINT_TABLE

export interface WhiteboardWriter {
  replace(document: Document): void
  patch(patch: DocumentPatch): void
  order: {
    insert(ref: CanvasItemRef, anchor?: MutationSequenceAnchor | {
      kind: 'start' | 'end' | 'before' | 'after'
      itemId?: string
    }): void
    delete(ref: CanvasItemRef | string): void
    move(ref: CanvasItemRef | string, anchor?: MutationSequenceAnchor | {
      kind: 'start' | 'end' | 'before' | 'after'
      itemId?: string
    }): void
    splice(refs: readonly (CanvasItemRef | string)[], anchor?: MutationSequenceAnchor | {
      kind: 'start' | 'end' | 'before' | 'after'
      itemId?: string
    }): void
    replace(order: readonly CanvasItemRef[]): void
  }
  node: {
    create(node: Node): void
    delete(id: NodeId): void
    patch(id: NodeId, patch: Partial<Node>): void
  }
  edge: {
    create(edge: Edge): void
    delete(id: EdgeId): void
    patch(id: EdgeId, patch: EdgePatch): void
    (id: EdgeId): {
      labels: {
        insert(label: EdgeLabel, anchor?: MutationSequenceAnchor): void
        create(label: EdgeLabel, anchor?: MutationSequenceAnchor): void
        patch(labelId: string, patch: Partial<EdgeLabel>): void
        move(labelId: string, anchor?: MutationSequenceAnchor): void
        delete(labelId: string): void
      }
      points: {
        insert(point: EdgeRoutePoint, anchor?: MutationSequenceAnchor): void
        create(point: EdgeRoutePoint, anchor?: MutationSequenceAnchor): void
        patch(pointId: string, patch: Partial<EdgeRoutePoint>): void
        move(pointId: string, anchor?: MutationSequenceAnchor): void
        delete(pointId: string): void
      }
    }
  }
  group: {
    create(group: Group): void
    delete(id: GroupId): void
    patch(id: GroupId, patch: Partial<Group>): void
  }
  mindmap: {
    create(mindmap: MindmapRecord): void
    delete(id: MindmapId): void
    patch(id: MindmapId, patch: Partial<Pick<MindmapRecord, 'layout'>>): void
    (id: MindmapId): {
      tree: {
        insert(nodeId: string, value: MutationTreeInsertInput<WhiteboardMindmapTreeValue>): void
        move(nodeId: string, value: MutationTreeMoveInput): void
        patch(nodeId: string, patch: Record<string, unknown>): void
        delete(nodeId: string): void
      }
    }
  }
}

export const createWhiteboardWriter = (
  write: WhiteboardMutationWriterBase,
  readDocument: () => Document
): WhiteboardWriter => {
  const documentOrder = {
    insert(ref: CanvasItemRef, anchor?: MutationSequenceAnchor | {
      kind: 'start' | 'end' | 'before' | 'after'
      itemId?: string
    }) {
      write.order.insert(ref, normalizeSequenceAnchor(anchor))
    },
    delete(ref: CanvasItemRef | string) {
      write.order.remove(typeof ref === 'string' ? parseCanvasRefKey(ref) : ref)
    },
    move(ref: CanvasItemRef | string, anchor?: MutationSequenceAnchor | {
      kind: 'start' | 'end' | 'before' | 'after'
      itemId?: string
    }) {
      write.order.move(
        typeof ref === 'string' ? parseCanvasRefKey(ref) : ref,
        normalizeSequenceAnchor(anchor)
      )
    },
    splice(refs: readonly (CanvasItemRef | string)[], anchor?: MutationSequenceAnchor | {
      kind: 'start' | 'end' | 'before' | 'after'
      itemId?: string
    }) {
      const moved = refs.map((ref) => typeof ref === 'string' ? parseCanvasRefKey(ref) : ref)
      write.order.replace(
        moveItems({
          order: readDocument().order,
          moved,
          anchor: normalizeSequenceAnchor(anchor)
        })
      )
    },
    replace(order: readonly CanvasItemRef[]) {
      write.order.replace(order)
    }
  }

  const edgeItem = (edgeId: EdgeId) => ({
    labels: {
      insert(label: EdgeLabel, anchor?: MutationSequenceAnchor) {
        const table = readEdgeLabelTable(readDocument().edges[edgeId])
        write.edges(edgeId).patch({
          labels: {
            byId: {
              ...table.byId,
              [label.id]: structuredClone(label)
            },
            ids: moveOrderedIds(table.ids, [label.id], anchor)
          }
        })
      },
      create(label: EdgeLabel, anchor?: MutationSequenceAnchor) {
        const table = readEdgeLabelTable(readDocument().edges[edgeId])
        write.edges(edgeId).patch({
          labels: {
            byId: {
              ...table.byId,
              [label.id]: structuredClone(label)
            },
            ids: moveOrderedIds(table.ids, [label.id], anchor)
          }
        })
      },
      patch(labelId: string, patch: Partial<EdgeLabel>) {
        const table = readEdgeLabelTable(readDocument().edges[edgeId])
        const current = table.byId[labelId]
        if (!current) {
          return
        }
        write.edges(edgeId).patch({
          labels: {
            byId: {
              ...table.byId,
              [labelId]: {
                ...current,
                ...structuredClone(patch),
                id: labelId
              }
            },
            ids: table.ids
          }
        })
      },
      move(labelId: string, anchor?: MutationSequenceAnchor) {
        const table = readEdgeLabelTable(readDocument().edges[edgeId])
        if (!table.byId[labelId]) {
          return
        }
        write.edges(edgeId).patch({
          labels: {
            byId: table.byId,
            ids: moveOrderedIds(table.ids, [labelId], anchor)
          }
        })
      },
      delete(labelId: string) {
        const table = readEdgeLabelTable(readDocument().edges[edgeId])
        if (!table.byId[labelId]) {
          return
        }
        const next = entityTable.write.remove(table, labelId)
        write.edges(edgeId).patch({
          labels: next.ids.length > 0
            ? next
            : undefined
        })
      }
    },
    points: {
      insert(point: EdgeRoutePoint, anchor?: MutationSequenceAnchor) {
        const points = readEdgePointTable(readDocument().edges[edgeId])
        write.edges(edgeId).patch({
          points: {
            byId: {
              ...points.byId,
              [point.id]: structuredClone(point)
            },
            ids: moveOrderedIds(points.ids, [point.id], anchor)
          }
        })
      },
      create(point: EdgeRoutePoint, anchor?: MutationSequenceAnchor) {
        const points = readEdgePointTable(readDocument().edges[edgeId])
        write.edges(edgeId).patch({
          points: {
            byId: {
              ...points.byId,
              [point.id]: structuredClone(point)
            },
            ids: moveOrderedIds(points.ids, [point.id], anchor)
          }
        })
      },
      patch(pointId: string, patch: Partial<EdgeRoutePoint>) {
        const points = readEdgePointTable(readDocument().edges[edgeId])
        const current = points.byId[pointId]
        if (!current) {
          return
        }
        write.edges(edgeId).patch({
          points: {
            byId: {
              ...points.byId,
              [pointId]: {
                ...current,
                ...structuredClone(patch),
                id: pointId
              }
            },
            ids: points.ids
          }
        })
      },
      move(pointId: string, anchor?: MutationSequenceAnchor) {
        const points = readEdgePointTable(readDocument().edges[edgeId])
        if (!points.byId[pointId]) {
          return
        }
        write.edges(edgeId).patch({
          points: {
            byId: points.byId,
            ids: moveOrderedIds(points.ids, [pointId], anchor)
          }
        })
      },
      delete(pointId: string) {
        const points = readEdgePointTable(readDocument().edges[edgeId])
        if (!points.byId[pointId]) {
          return
        }
        const next = entityTable.write.remove(points, pointId)
        write.edges(edgeId).patch({
          points: next.ids.length > 0
            ? next
            : undefined
        })
      }
    }
  })

  const mindmapItem = (mindmapId: MindmapId) => ({
    tree: {
      insert(nodeId: string, value: MutationTreeInsertInput<WhiteboardMindmapTreeValue>) {
        write.mindmaps(mindmapId).tree.insert(nodeId, value)
      },
      move(nodeId: string, value: MutationTreeMoveInput) {
        write.mindmaps(mindmapId).tree.move(nodeId, value)
      },
      patch(nodeId: string, patch: Record<string, unknown>) {
        write.mindmaps(mindmapId).tree.patch(nodeId, patch)
      },
      delete(nodeId: string) {
        write.mindmaps(mindmapId).tree.remove(nodeId)
      }
    }
  })

  const edge = Object.assign(
    (id: EdgeId) => edgeItem(id),
    {
      create(next: Edge) {
        write.edges.create(next.id, toEdgeValue(next))
      },
      delete(id: EdgeId) {
        write.edges.remove(id)
      },
      patch(id: EdgeId, patch: EdgePatch) {
        const current = readDocument().edges[id]
        if (!current) {
          return
        }
        const {
          points,
          labels,
          ...rest
        } = patch
        const next: Edge = {
          ...current,
          ...rest,
          ...(labels === undefined
            ? {}
            : {
                labels: entityTable.normalize.list(labels)
              }),
          ...(points === undefined
            ? {}
            : {
                points: toEdgePoints(points)
              })
        }
        write.edges.replace(id, toEdgeValue({
          ...next
        }))
      }
    }
  )

  const mindmap = Object.assign(
    (id: MindmapId) => mindmapItem(id),
    {
      create(next: MindmapRecord) {
        write.mindmaps.create(next.id, toMindmapValue(next))
      },
      delete(id: MindmapId) {
        write.mindmaps.remove(id)
      },
      patch(id: MindmapId, patch: Partial<Pick<MindmapRecord, 'layout'>>) {
        const item = write.mindmaps(id)
        if (patch.layout !== undefined) {
          item.layout.set(patch.layout)
        }
      }
    }
  )

  return {
    replace(next) {
        const current = readDocument()
        write.id.set(next.id)
        write.name.set(next.name)
        write.background.set(next.background)
        documentOrder.replace(next.order)

        Object.keys(current.nodes).forEach((id) => {
          if (!next.nodes[id]) {
            write.nodes.remove(id)
          }
        })
        Object.values(next.nodes).forEach((node) => {
          if (current.nodes[node.id]) {
            write.nodes.replace(node.id, toNodeValue(node))
            return
          }
          write.nodes.create(node.id, toNodeValue(node))
        })

        Object.keys(current.edges).forEach((id) => {
          if (!next.edges[id]) {
            write.edges.remove(id)
          }
        })
        Object.values(next.edges).forEach((entry) => {
          if (current.edges[entry.id]) {
            write.edges.replace(entry.id, toEdgeValue(entry))
            return
          }
          write.edges.create(entry.id, toEdgeValue(entry))
        })

        Object.keys(current.groups).forEach((id) => {
          if (!next.groups[id]) {
            write.groups.remove(id)
          }
        })
        Object.values(next.groups).forEach((entry) => {
          if (current.groups[entry.id]) {
            write.groups.replace(entry.id, toGroupValue(entry))
            return
          }
          write.groups.create(entry.id, toGroupValue(entry))
        })

        Object.keys(current.mindmaps).forEach((id) => {
          if (!next.mindmaps[id]) {
            write.mindmaps.remove(id)
          }
        })
        Object.values(next.mindmaps).forEach((entry) => {
          if (current.mindmaps[entry.id]) {
            write.mindmaps.replace(entry.id, toMindmapValue(entry))
            return
          }
          write.mindmaps.create(entry.id, toMindmapValue(entry))
        })
      },
      patch(patch: DocumentPatch) {
        if (patch.id !== undefined) {
          write.id.set(patch.id)
        }
        if ('name' in patch) {
          write.name.set(patch.name)
        }
        if ('background' in patch) {
          write.background.set(patch.background)
        }
        if ('order' in patch && patch.order) {
          write.order.replace(patch.order)
        }
      },
    order: documentOrder,
    node: {
      create(next) {
        write.nodes.create(next.id, toNodeValue(next))
      },
      delete(id) {
        write.nodes.remove(id)
      },
      patch(id, patch) {
        write.nodes(id).patch(patch)
      }
    },
    edge,
    group: {
      create(next) {
        write.groups.create(next.id, toGroupValue(next))
      },
      delete(id) {
        write.groups.remove(id)
      },
      patch(id, patch) {
        write.groups(id).patch(patch)
      }
    },
    mindmap,
  }
}
