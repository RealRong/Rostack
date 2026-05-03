import type {
  MutationShapeKeys
} from '../schema/facadeTypes'
import type {
  MutationDictionaryNode,
  MutationFieldNode,
  MutationMapNode,
  MutationObjectNode,
  MutationSequenceNode,
  MutationShape,
  MutationSingletonNode,
  MutationTableNode,
  MutationTreeNode
} from '../schema/node'
import type {
  MutationWrite
} from '../writer/writes'

export type MutationDeltaControls = {
  reset(): boolean
  writes(): readonly MutationWrite[]
}

export type MutationFieldDelta = {
  changed(): boolean
}

export type MutationDictionaryDelta<TKey extends string> = {
  changed(key?: TKey): boolean
  anyChanged(): boolean
  has(key: TKey): boolean
}

export type MutationSequenceDelta<TItem> = {
  changed(): boolean
  orderChanged(): boolean
  contains(item: TItem): boolean
}

export type MutationTreeDelta<TNodeId extends string> = {
  changed(): boolean
  structureChanged(): boolean
  nodeChanged(nodeId: TNodeId): boolean
}

export type MutationObjectDelta<TShape extends MutationShape> = MutationDeltaShape<TShape> & {
  changed(): boolean
}

export type MutationCollectionDelta<TId extends string, TShape extends MutationShape> = ((id: TId) => MutationObjectDelta<TShape>) & {
  changed(id?: TId): boolean
  created(id: TId): boolean
  removed(id: TId): boolean
  contains(id: TId): boolean
  touchedIds(): ReadonlySet<TId> | 'all'
}

export type MutationDeltaNode<TNode> =
  TNode extends MutationFieldNode<any, boolean> ? MutationFieldDelta
  : TNode extends MutationObjectNode<infer TShape> ? MutationObjectDelta<TShape>
  : TNode extends MutationDictionaryNode<infer TKey extends string, any>
    ? MutationDictionaryDelta<TKey>
  : TNode extends MutationSequenceNode<infer TItem>
    ? MutationSequenceDelta<TItem>
  : TNode extends MutationTreeNode<infer TNodeId extends string, any>
    ? MutationTreeDelta<TNodeId>
  : TNode extends MutationSingletonNode<infer TShape>
    ? MutationObjectDelta<TShape>
  : TNode extends MutationTableNode<infer TId extends string, infer TShape>
    ? MutationCollectionDelta<TId, TShape>
  : TNode extends MutationMapNode<infer TId extends string, infer TShape>
    ? MutationCollectionDelta<TId, TShape>
  : TNode extends MutationShape
    ? MutationDeltaShape<TNode>
  : never

export type MutationDeltaShape<TShape extends MutationShape> = {
  readonly [K in MutationShapeKeys<TShape>]: MutationDeltaNode<TShape[K]>
}

export type MutationDeltaBaseOfShape<TShape extends MutationShape> =
  MutationDeltaShape<TShape> & MutationDeltaControls
