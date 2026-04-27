import { schema as schemaApi } from '@whiteboard/core/registry/schema'
import { resolveNodeBootstrapSize } from '@whiteboard/core/node/bootstrap'
import { err, ok } from '@whiteboard/core/utils/result'
import type {
  CoreRegistries,
  Node,
  NodeId,
  NodeInput,
  Result
} from '@whiteboard/core/types'

type MaterializeNodeInput = {
  node: NodeInput | Node
  registries?: CoreRegistries
  createNodeId?: () => NodeId
}

export const materializeCommittedNode = (
  input: MaterializeNodeInput
): Result<Node, 'invalid'> => {
  const source = input.registries
    ? schemaApi.node.applyDefaults(input.node as NodeInput, input.registries)
    : input.node
  const id = source.id ?? input.createNodeId?.()

  if (!id) {
    return err('invalid', 'Missing node id.')
  }
  if (!source.type) {
    return err('invalid', `Node ${id} is missing type.`)
  }
  if (!source.position) {
    return err('invalid', `Node ${id} is missing position.`)
  }

  const size = resolveNodeBootstrapSize(source)
  if (!size) {
    return err('invalid', `Node ${id} is missing committed size.`)
  }

  return ok({
    ...source,
    id,
    size
  })
}
