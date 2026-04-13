import type { Node } from '@whiteboard/core/types'
import type { NodeDefinition, NodeMeta, NodeRegistry } from '#whiteboard-react/types/node'

export const createNodeRegistry = (definitions: NodeDefinition[] = []): NodeRegistry => {
  const map = new Map(definitions.map((definition) => [definition.type, definition]))

  return {
    get: (type) => map.get(type),
    register: (definition) => {
      map.set(definition.type, definition)
    }
  }
}

export const resolveNodeMeta = (
  registry: Pick<NodeRegistry, 'get'>,
  node: Node
): NodeMeta | undefined => {
  const definition = registry.get(node.type)
  if (!definition) {
    return undefined
  }

  return definition.describe?.(node) ?? definition.meta
}
