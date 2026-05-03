import type {
  MutationAccessOverride
} from './constants'
import type {
  MutationMapNode,
  MutationSequenceNode,
  MutationShape,
  MutationShapeNode,
  MutationSingletonNode,
  MutationTableNode,
  MutationTreeNode,
} from './node'
import type {
  MutationNodeMeta
} from './meta'
import type {
  MutationMapValue,
  MutationTableValue,
  MutationValueOfShape,
} from './value'

type MutationAccessNode =
  | MutationSequenceNode<unknown>
  | MutationTreeNode<string, unknown>
  | MutationSingletonNode<MutationShape>
  | MutationTableNode<string, MutationShape>
  | MutationMapNode<string, MutationShape>

type MutationAccessOfNode<TNode extends MutationAccessNode> =
  TNode extends MutationSequenceNode<infer TItem>
    ? MutationAccessOverride<readonly TItem[]>
  : TNode extends MutationTreeNode<string, infer TValue>
    ? MutationAccessOverride<import('./constants').MutationTreeSnapshot<TValue>>
  : TNode extends MutationSingletonNode<infer TShape>
    ? MutationAccessOverride<MutationValueOfShape<TShape>>
  : TNode extends MutationTableNode<infer TId extends string, infer TShape>
    ? MutationAccessOverride<MutationTableValue<TId, TShape>>
  : TNode extends MutationMapNode<infer TId extends string, infer TShape>
    ? MutationAccessOverride<MutationMapValue<TId, TShape>>
  : never

const nodeMetaMap = new WeakMap<MutationShapeNode, MutationNodeMeta>()
const nodeAccessMap = new WeakMap<MutationAccessNode, MutationAccessOverride<unknown>>()

export const getNodeMeta = (
  node: MutationShapeNode
): MutationNodeMeta => {
  const meta = nodeMetaMap.get(node)
  if (!meta) {
    throw new Error('Mutation schema node has not been attached to a schema.')
  }
  return meta
}

export const setNodeMeta = <TNode extends MutationShapeNode>(
  node: TNode,
  meta: MutationNodeMeta
): TNode => {
  nodeMetaMap.set(node, meta)
  return node
}

export const getNodeAccess = <TNode extends MutationAccessNode>(
  node: TNode
): MutationAccessOfNode<TNode> | undefined => nodeAccessMap.get(node) as MutationAccessOfNode<TNode> | undefined

export const setNodeAccess = <TNode extends MutationAccessNode>(
  node: TNode,
  access: MutationAccessOfNode<TNode>
): TNode => {
  nodeAccessMap.set(node, access as MutationAccessOverride<unknown>)
  return node
}

export const copyNodeAccess = <TNode extends MutationAccessNode>(
  source: TNode,
  target: TNode
): TNode => {
  const access = getNodeAccess(source)
  if (access) {
    setNodeAccess(target, access)
  }
  return target
}
