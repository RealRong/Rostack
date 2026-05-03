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
  WhiteboardMutationWriterBase,
} from './model'
import {
  canvasRefKey,
  createMindmapTreeSnapshot,
  getLabels,
  getManualRoutePoints,
  parseCanvasRefKey,
  type WhiteboardMindmapTreeValue,
} from './support'

const toNodeValue = (
  node: Node
) => ({
  id: node.id,
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

const toEdgeLabelValue = (
  label: EdgeLabel
) => ({
  id: label.id,
  text: label.text,
  t: label.t,
  offset: label.offset,
  style: label.style,
  data: label.data,
})

const toEdgeRoutePointValue = (
  point: EdgeRoutePoint
) => ({
  id: point.id,
  x: point.x,
  y: point.y,
})

const toEdgeValue = (
  edge: Edge
) => ({
  id: edge.id,
  source: edge.source,
  target: edge.target,
  type: edge.type,
  locked: edge.locked,
  groupId: edge.groupId,
  textMode: edge.textMode,
  style: edge.style,
  data: edge.data,
  labels: {
    ids: getLabels(edge).map((label) => label.id),
    byId: Object.fromEntries(
      getLabels(edge).map((label) => [label.id, toEdgeLabelValue(label)])
    )
  },
  route: {
    ids: getManualRoutePoints(edge).map((point) => point.id),
    byId: Object.fromEntries(
      getManualRoutePoints(edge).map((point) => [point.id, toEdgeRoutePointValue(point)])
    )
  }
})

const toEdgeRoute = (
  route: EdgePatch['route'] | Edge['route']
): Edge['route'] | undefined => {
  if (!route) {
    return undefined
  }
  if (route.kind === 'auto') {
    return {
      kind: 'auto'
    }
  }

  return {
    kind: 'manual',
    points: route.points.map((point, index) => ({
      id: 'id' in point
        ? point.id
        : `route-point-${index}`,
      x: point.x,
      y: point.y
    }))
  }
}

const toGroupValue = (
  group: Group
) => ({
  id: group.id,
  locked: group.locked,
  name: group.name,
})

const toMindmapValue = (
  mindmap: MindmapRecord
) => ({
  id: mindmap.id,
  root: mindmap.root,
  layout: mindmap.layout,
  structure: createMindmapTreeSnapshot(mindmap)
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

export interface WhiteboardWriter {
  document: {
    create(document: Document): void
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
      route: {
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
    patch(id: MindmapId, patch: Partial<Pick<MindmapRecord, 'root' | 'layout'>>): void
    (id: MindmapId): {
      structure: {
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
      write.document.order.insert(ref, normalizeSequenceAnchor(anchor))
    },
    delete(ref: CanvasItemRef | string) {
      write.document.order.remove(typeof ref === 'string' ? parseCanvasRefKey(ref) : ref)
    },
    move(ref: CanvasItemRef | string, anchor?: MutationSequenceAnchor | {
      kind: 'start' | 'end' | 'before' | 'after'
      itemId?: string
    }) {
      write.document.order.move(
        typeof ref === 'string' ? parseCanvasRefKey(ref) : ref,
        normalizeSequenceAnchor(anchor)
      )
    },
    splice(refs: readonly (CanvasItemRef | string)[], anchor?: MutationSequenceAnchor | {
      kind: 'start' | 'end' | 'before' | 'after'
      itemId?: string
    }) {
      const moved = refs.map((ref) => typeof ref === 'string' ? parseCanvasRefKey(ref) : ref)
      write.document.order.replace(
        moveItems({
          order: readDocument().order,
          moved,
          anchor: normalizeSequenceAnchor(anchor)
        })
      )
    },
    replace(order: readonly CanvasItemRef[]) {
      write.document.order.replace(order)
    }
  }

  const edgeItem = (edgeId: EdgeId) => ({
    labels: {
      insert(label: EdgeLabel, anchor?: MutationSequenceAnchor) {
        write.edges(edgeId).labels.create(toEdgeLabelValue(label), anchor)
      },
      create(label: EdgeLabel, anchor?: MutationSequenceAnchor) {
        write.edges(edgeId).labels.create(toEdgeLabelValue(label), anchor)
      },
      patch(labelId: string, patch: Partial<EdgeLabel>) {
        write.edges(edgeId).labels(labelId).patch(patch)
      },
      move(labelId: string, anchor?: MutationSequenceAnchor) {
        write.edges(edgeId).labels.move(labelId, anchor)
      },
      delete(labelId: string) {
        write.edges(edgeId).labels.remove(labelId)
      }
    },
    route: {
      insert(point: EdgeRoutePoint, anchor?: MutationSequenceAnchor) {
        write.edges(edgeId).route.create(toEdgeRoutePointValue(point), anchor)
      },
      create(point: EdgeRoutePoint, anchor?: MutationSequenceAnchor) {
        write.edges(edgeId).route.create(toEdgeRoutePointValue(point), anchor)
      },
      patch(pointId: string, patch: Partial<EdgeRoutePoint>) {
        write.edges(edgeId).route(pointId).patch(patch)
      },
      move(pointId: string, anchor?: MutationSequenceAnchor) {
        write.edges(edgeId).route.move(pointId, anchor)
      },
      delete(pointId: string) {
        write.edges(edgeId).route.remove(pointId)
      }
    }
  })

  const mindmapItem = (mindmapId: MindmapId) => ({
    structure: {
      insert(nodeId: string, value: MutationTreeInsertInput<WhiteboardMindmapTreeValue>) {
        write.mindmaps(mindmapId).structure.insert(nodeId, value)
      },
      move(nodeId: string, value: MutationTreeMoveInput) {
        write.mindmaps(mindmapId).structure.move(nodeId, value)
      },
      patch(nodeId: string, patch: Record<string, unknown>) {
        write.mindmaps(mindmapId).structure.patch(nodeId, patch)
      },
      delete(nodeId: string) {
        write.mindmaps(mindmapId).structure.remove(nodeId)
      }
    }
  })

  const edge = Object.assign(
    (id: EdgeId) => edgeItem(id),
    {
      create(next: Edge) {
        write.edges.create(toEdgeValue(next))
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
          route,
          labels,
          ...rest
        } = patch
        const next: Edge = {
          ...current,
          ...rest,
          ...(labels === undefined
            ? {}
            : {
                labels: [...labels]
              }),
          ...(route === undefined
            ? {}
            : {
                route: toEdgeRoute(route)
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
        write.mindmaps.create(toMindmapValue(next))
      },
      delete(id: MindmapId) {
        write.mindmaps.remove(id)
      },
      patch(id: MindmapId, patch: Partial<Pick<MindmapRecord, 'root' | 'layout'>>) {
        const item = write.mindmaps(id)
        if (patch.root !== undefined) {
          item.root.set(patch.root)
        }
        if (patch.layout !== undefined) {
          item.layout.set(patch.layout)
        }
      }
    }
  )

  return {
    document: {
      create(next) {
        const current = readDocument()
        write.document.id.set(next.id)
        write.document.name.set(next.name)
        write.document.background.set(next.background)
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
          write.nodes.create(toNodeValue(node))
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
          write.edges.create(toEdgeValue(entry))
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
          write.groups.create(toGroupValue(entry))
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
          write.mindmaps.create(toMindmapValue(entry))
        })
      },
      patch(patch: DocumentPatch) {
        if (patch.id !== undefined) {
          write.document.id.set(patch.id)
        }
        if ('name' in patch) {
          write.document.name.set(patch.name)
        }
        if ('background' in patch) {
          write.document.background.set(patch.background)
        }
        if ('order' in patch && patch.order) {
          write.document.order.replace(patch.order)
        }
      },
      order: documentOrder,
    },
    node: {
      create(next) {
        write.nodes.create(toNodeValue(next))
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
        write.groups.create(toGroupValue(next))
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
