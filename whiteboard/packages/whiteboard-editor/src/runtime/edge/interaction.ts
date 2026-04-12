import type { EdgeId } from '@whiteboard/core/types'
import type { EdgeRead } from '../read/edge'
import type { SessionCommands } from '../commands/session'

export const readEdgeInteractionCapability = (
  edge: Pick<EdgeRead, 'item' | 'capability'>,
  edgeId: EdgeId
) => {
  const item = edge.item.get(edgeId)
  return item
    ? edge.capability(item.edge)
    : undefined
}

export const selectEdgeInteraction = (
  session: Pick<SessionCommands, 'selection'>,
  edgeId: EdgeId
) => {
  session.selection.replace({
    edgeIds: [edgeId]
  })
}
