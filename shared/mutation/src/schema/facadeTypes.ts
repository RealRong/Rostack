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

export type MutationShapeMemberNode =
  | MutationFieldNode<any, boolean>
  | MutationObjectNode<any>
  | MutationDictionaryNode<any, any>
  | MutationSequenceNode<any>
  | MutationTreeNode<any, any>
  | MutationSingletonNode<any>
  | MutationTableNode<any, any>
  | MutationMapNode<any, any>

type MutationNamedKeys<TShape extends MutationShape> = keyof {
  readonly [K in keyof TShape as string extends K
    ? never
    : number extends K
      ? never
      : symbol extends K
        ? never
        : K]: true
}

export type MutationShapeKeys<TShape extends MutationShape> = keyof {
  readonly [K in MutationNamedKeys<TShape> as TShape[K] extends MutationShapeMemberNode | MutationShape
    ? K
    : never]: true
}
