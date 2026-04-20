import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { node as nodeApi } from '@whiteboard/core/node'
import type {
  Document,
  Node,
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
    const bootstrapSize = nodeApi.bootstrap.resolve(stripped.node)

    if (bootstrapSize && !geometryApi.equal.size(node.size, bootstrapSize)) {
      entities[id] = {
        ...stripped.node,
        size: bootstrapSize
      }
      changed = true
      return
    }

    if (stripped.changed) {
      entities[id] = stripped.node
      changed = true
      return
    }

    entities[id] = node
  })

  return changed
    ? {
        ...document,
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
        const stripped = stripLegacyNodeFields(operation.node)
        const bootstrapSize = nodeApi.bootstrap.resolve(stripped.node)
        if (bootstrapSize && !geometryApi.equal.size(stripped.node.size, bootstrapSize)) {
          next.push({
            ...operation,
            node: {
              ...stripped.node,
              size: bootstrapSize
            }
          })
          return
        }

        if (stripped.changed) {
          next.push({
            ...operation,
            node: stripped.node
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
