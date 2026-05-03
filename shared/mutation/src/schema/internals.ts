import type {
  MutationAccessOverride
} from './constants'
import type {
  MutationSchema,
  MutationSchemaChangeFactory,
  MutationSchemaChangeSet,
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
const schemaChangeFactoryMap = new WeakMap<
  MutationSchema<MutationShape, MutationSchemaChangeSet>,
  MutationSchemaChangeFactory<MutationShape, MutationSchemaChangeSet>
>()

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

export const getSchemaChangeFactory = <
  TShape extends MutationShape,
  TChanges extends MutationSchemaChangeSet
>(
  schema: MutationSchema<TShape, TChanges>
): MutationSchemaChangeFactory<TShape, TChanges> | undefined => schemaChangeFactoryMap.get(
  schema as MutationSchema<MutationShape, MutationSchemaChangeSet>
) as MutationSchemaChangeFactory<TShape, TChanges> | undefined

export const setSchemaChangeFactory = <
  TShape extends MutationShape,
  TChanges extends MutationSchemaChangeSet
>(
  schema: MutationSchema<TShape, TChanges>,
  factory: MutationSchemaChangeFactory<TShape, TChanges>
): MutationSchema<TShape, TChanges> => {
  schemaChangeFactoryMap.set(
    schema as MutationSchema<MutationShape, MutationSchemaChangeSet>,
    factory as MutationSchemaChangeFactory<MutationShape, MutationSchemaChangeSet>
  )
  return schema
}
