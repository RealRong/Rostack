import { isSizeEqual } from '@whiteboard/core/geometry'
import {
  isNodeUpdateEmpty,
  resolveNodeBootstrapSize
} from '@whiteboard/core/node'
import type {
  Document,
  Node,
  Operation
} from '@whiteboard/core/types'

export const sanitizeDocument = (
  document: Document
): Document => {
  let changed = false
  const entities: Record<string, Node> = {}

  Object.entries(document.nodes).forEach(([id, node]) => {
    const bootstrapSize = resolveNodeBootstrapSize(node)

    if (bootstrapSize && !isSizeEqual(node.size, bootstrapSize)) {
      entities[id] = {
        ...node,
        size: bootstrapSize
      }
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
        const bootstrapSize = resolveNodeBootstrapSize(operation.node)
        if (bootstrapSize && !isSizeEqual(operation.node.size, bootstrapSize)) {
          next.push({
            ...operation,
            node: {
              ...operation.node,
              size: bootstrapSize
            }
          })
          return
        }

        next.push(operation)
        return
      }
      case 'node.update': {
        if (isNodeUpdateEmpty(operation.update)) {
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
