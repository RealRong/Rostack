import type { NodeId } from '@whiteboard/core/types'
import { isSameRefOrder } from '@whiteboard/core/utils'
import { createTrackedRead } from './tracked'

const EMPTY_NODE_IDS: readonly NodeId[] = []

export const createTreeProjection = ({
  readIds
}: {
  readIds: (rootId: NodeId) => readonly NodeId[]
}) => {
  const cacheByRootId = new Map<NodeId, readonly NodeId[]>()
  const tracked = createTrackedRead<NodeId, readonly NodeId[]>({
    emptyValue: EMPTY_NODE_IDS,
    read: (rootId) => readCached(rootId)
  })

  const resolveIds = (
    rootId: NodeId,
    previous?: readonly NodeId[]
  ): readonly NodeId[] => {
    const next = readIds(rootId)
    return previous && isSameRefOrder(previous, next)
      ? previous
      : next
  }

  const readCached = (
    rootId: NodeId
  ) => {
    const next = resolveIds(rootId, cacheByRootId.get(rootId))
    cacheByRootId.set(rootId, next)
    return next
  }

  const applyChange = () => {
    if (!tracked.size()) {
      return
    }
    tracked.sync(tracked.keys())
  }

  return {
    item: tracked.item,
    applyChange
  }
}
