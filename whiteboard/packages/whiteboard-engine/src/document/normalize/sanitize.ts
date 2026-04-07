import {
  isNodeUpdateEmpty,
  sanitizeGroupNode,
  sanitizeGroupUpdate
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
    const nextNode = sanitizeGroupNode(node)
    entities[id] = nextNode
    if (nextNode !== node) {
      changed = true
    }
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
        const node = sanitizeGroupNode(operation.node)
        if (node === operation.node) {
          next.push(operation)
          return
        }

        next.push({
          ...operation,
          node
        })
        return
      }
      case 'node.update': {
        const current = document.nodes[operation.id]
        const update = sanitizeGroupUpdate(operation.update)
        if (update === operation.update) {
          next.push(operation)
          return
        }

        if (isNodeUpdateEmpty(update)) {
          return
        }
        next.push({
          ...operation,
          update
        })
        return
      }
      default:
        next.push(operation)
    }
  })

  return next
}
