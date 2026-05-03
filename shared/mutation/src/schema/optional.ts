import {
  MUTATION_OPTIONAL
} from './constants'
import type {
  MutationFieldNode,
  MutationOptionalNode,
  MutationOptionalizedNode,
  MutationShapeNode
} from './node'

export function optional<TValue>(
  node: MutationFieldNode<TValue, boolean>
): MutationFieldNode<TValue, true>
export function optional<TNode extends MutationShapeNode>(
  node: TNode
): TNode & MutationOptionalNode
export function optional<TNode extends MutationShapeNode>(
  node: TNode
): MutationOptionalizedNode<TNode> {
  return {
  ...node,
  [MUTATION_OPTIONAL]: true
} as MutationOptionalizedNode<TNode>
}
