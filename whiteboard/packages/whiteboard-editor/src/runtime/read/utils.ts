import { getTargetBounds, type SelectionTarget } from '@whiteboard/core/selection'
import type { Edge, Node, Rect } from '@whiteboard/core/types'
import type { ReadFn } from '@shared/core'
import type { EdgeRead } from './edge'
import type { NodeRead } from './node'

export const readUniformValue = <TItem, TValue>(
  items: readonly TItem[],
  read: (item: TItem) => TValue,
  equal: (left: TValue, right: TValue) => boolean = Object.is
): TValue | undefined => {
  if (!items.length) {
    return undefined
  }

  const first = read(items[0]!)
  return items.every((item) => equal(first, read(item)))
    ? first
    : undefined
}

export const readTargetNodes = (
  readStore: ReadFn,
  node: Pick<NodeRead, 'item'>,
  target: Pick<SelectionTarget, 'nodeIds'>
): Node[] => target.nodeIds
  .map((nodeId) => readStore(node.item, nodeId)?.node)
  .filter((entry): entry is Node => Boolean(entry))

export const readTargetEdges = (
  readStore: ReadFn,
  edge: Pick<EdgeRead, 'item'>,
  target: Pick<SelectionTarget, 'edgeIds'>
): Edge[] => target.edgeIds
  .map((edgeId) => readStore(edge.item, edgeId)?.edge)
  .filter((entry): entry is Edge => Boolean(entry))

export const readTargetBounds = (
  readStore: ReadFn,
  node: Pick<NodeRead, 'bounds'>,
  edge: Pick<EdgeRead, 'bounds'>,
  target: SelectionTarget
): Rect | undefined => getTargetBounds({
  target,
  readNodeBounds: (nodeId) => readStore(node.bounds, nodeId),
  readEdgeBounds: (edgeId) => readStore(edge.bounds, edgeId)
})
