import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { node as nodeApi } from '@whiteboard/core/node'
import type {
  CanvasItemRef,
  Document,
  EdgeId,
  MindmapId,
  Node,
  NodeId,
  Operation
} from '@whiteboard/core/types'

const hasOwn = <T extends object>(
  target: T,
  key: PropertyKey
) => Object.prototype.hasOwnProperty.call(target, key)

const stripLegacyNodeFields = (
  node: Node
): {
  changed: boolean
  node: Node
} => {
  const legacy = node as Node & {
    layer?: unknown
    zIndex?: unknown
  }
  const changed = hasOwn(legacy, 'layer') || hasOwn(legacy, 'zIndex')
  if (!changed) {
    return {
      changed: false,
      node
    }
  }

  const {
    layer: _layer,
    zIndex: _zIndex,
    ...next
  } = legacy

  return {
    changed: true,
    node: next as Node
  }
}

export const sanitizeDocument = (
  document: Document
): Document => {
  let changed = false
  const entities: Record<string, Node> = {}

  Object.entries(document.nodes).forEach(([id, node]) => {
    const stripped = stripLegacyNodeFields(node)
    const materialized = nodeApi.materialize.committed({
      node: stripped.node
    })
    if (!materialized.ok) {
      entities[id] = stripped.node as Node
      return
    }

    if (
      !geometryApi.equal.size(node.size, materialized.data.size)
      || stripped.changed
    ) {
      entities[id] = materialized.data
      changed = true
      return
    }

    entities[id] = node
  })

  const normalizedOrder = (() => {
    const next: CanvasItemRef[] = []
    const seen = new Set<string>()
    const push = (ref: CanvasItemRef) => {
      const key = `${ref.kind}:${ref.id}`
      if (seen.has(key)) {
        return
      }

      seen.add(key)
      next.push(ref)
    }
    const isTopLevelNode = (nodeId: NodeId) => Boolean(entities[nodeId] && !entities[nodeId]?.owner)

    document.canvas.order.forEach((ref) => {
      switch (ref.kind) {
        case 'node':
          if (isTopLevelNode(ref.id)) {
            push(ref)
          }
          return
        case 'mindmap':
          if (document.mindmaps[ref.id]) {
            push(ref)
          }
          return
        case 'edge':
          if (document.edges[ref.id]) {
            push(ref)
          }
      }
    })

    ;(Object.keys(entities) as readonly NodeId[]).forEach((nodeId) => {
      if (isTopLevelNode(nodeId)) {
        push({
          kind: 'node',
          id: nodeId
        })
      }
    })
    ;(Object.keys(document.mindmaps) as readonly MindmapId[]).forEach((mindmapId) => {
      push({
        kind: 'mindmap',
        id: mindmapId
      })
    })
    ;(Object.keys(document.edges) as readonly EdgeId[]).forEach((edgeId) => {
      push({
        kind: 'edge',
        id: edgeId
      })
    })

    return next
  })()
  const orderChanged =
    normalizedOrder.length !== document.canvas.order.length
    || normalizedOrder.some((ref, index) => (
      ref.kind !== document.canvas.order[index]?.kind
      || ref.id !== document.canvas.order[index]?.id
    ))

  return changed || orderChanged
    ? {
        ...document,
        canvas: {
          ...document.canvas,
          order: normalizedOrder
        },
        nodes: entities
      }
    : document
}

export const sanitizeOperations = ({
  document,
  operations
}: {
  document: Document
  operations: readonly Operation[]
}): Operation[] => {
  const next: Operation[] = []

  operations.forEach((operation) => {
    switch (operation.type) {
      case 'node.create': {
        const stripped = stripLegacyNodeFields(operation.value)
        const materialized = nodeApi.materialize.committed({
          node: stripped.node
        })
        if (!materialized.ok) {
          next.push(operation)
          return
        }
        if (
          !geometryApi.equal.size(stripped.node.size, materialized.data.size)
          || stripped.changed
        ) {
          next.push({
            ...operation,
            value: materialized.data
          })
          return
        }

        next.push(operation)
        return
      }
      default:
        next.push(operation)
    }
  })

  return next
}
