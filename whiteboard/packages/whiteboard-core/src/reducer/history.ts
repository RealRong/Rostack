import { collect, type WhiteboardHistoryRead } from '@whiteboard/core/spec/history'
import type { Operation } from '@whiteboard/core/types'
import type { WhiteboardReduceCtx } from './types'
import { readWhiteboardReduceInternal } from './context'
import {
  collectConnectedEdges,
  getEdge,
  getGroup,
  getMindmap,
  getMindmapTree,
  getNode
} from './internal/state'

const createHistoryRead = (
  state: ReturnType<typeof readWhiteboardReduceInternal>['state']
): WhiteboardHistoryRead => ({
  node: (id) => getNode(state.draft, id),
  edge: (id) => getEdge(state.draft, id),
  group: (id) => getGroup(state.draft, id),
  mindmap: (id) => getMindmap(state.draft, id),
  mindmapTree: (id) => getMindmapTree(state.draft, id),
  connectedEdges: (nodeIds) => collectConnectedEdges(state.draft, nodeIds)
})

export const collectWhiteboardHistory = (
  ctx: WhiteboardReduceCtx,
  op: Operation
): void => {
  const internal = readWhiteboardReduceInternal(ctx)

  collect.operation({
    read: createHistoryRead(internal.state),
    add: ctx.history.add,
    addMany: ctx.history.addMany
  }, op)
}
