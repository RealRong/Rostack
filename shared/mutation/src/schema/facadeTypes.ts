import type {
  MutationDictionaryNode,
  MutationFieldNode,
  MutationMapNode,
  MutationObjectNode,
  MutationSequenceNode,
  MutationShape,
  MutationSingletonNode,
  MutationTableNode,
  MutationTreeNode,
} from './node'

export type MutationDocumentMemberNode =
  | MutationFieldNode<any>
  | MutationObjectNode<any>
  | MutationDictionaryNode<any, any>
  | MutationSequenceNode<any>
  | MutationTreeNode<any, any>

export type MutationNamespaceMemberNode =
  | MutationSingletonNode<any>
  | MutationTableNode<any, any>
  | MutationMapNode<any, any>

export type MutationShapeMemberNode =
  | MutationDocumentMemberNode
  | MutationNamespaceMemberNode

export type MutationDocumentKeys<TShape extends MutationShape> = keyof {
  readonly [K in keyof TShape as TShape[K] extends MutationDocumentMemberNode
    ? K
    : never]: true
}

export type MutationNamespaceKeys<TShape extends MutationShape> = keyof {
  readonly [K in keyof TShape as TShape[K] extends MutationNamespaceMemberNode | MutationShape
    ? K
    : never]: true
}

export type MutationShapeKeys<TShape extends MutationShape> = keyof {
  readonly [K in keyof TShape as TShape[K] extends MutationShapeMemberNode | MutationShape
    ? K
    : never]: true
}

export type MutationHasDocumentMembers<TShape extends MutationShape> = [MutationDocumentKeys<TShape>] extends [never]
  ? false
  : true
