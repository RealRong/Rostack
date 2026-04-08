import type { Node } from '@whiteboard/core/types'
import type { WhiteboardRuntime } from '#react/types/runtime'
import type { NodeRegistry } from '#react/types/node'
import { replaceNodeSelection } from '#react/runtime/commands'

const readNodeMetaKey = (
  registry: Pick<NodeRegistry, 'get'>,
  node: Node
) => {
  const definition = registry.get(node.type)
  const meta = definition?.describe?.(node) ?? definition?.meta
  return meta?.key ?? node.type
}

export const selectNodesByTypeKey = ({
  editor,
  registry,
  nodes,
  key
}: {
  editor: WhiteboardRuntime
  registry: Pick<NodeRegistry, 'get'>
  nodes: readonly Node[]
  key: string
}) => {
  const nodeIds = nodes
    .filter((node) => readNodeMetaKey(registry, node) === key)
    .map((node) => node.id)
  if (!nodeIds.length) {
    return false
  }

  replaceNodeSelection(editor, nodeIds)
  return true
}
