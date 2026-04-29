import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { node as nodeApi } from '@whiteboard/core/node'
import type { NodeId, Rect } from '@whiteboard/core/types'
import type { Query } from '../../contracts/editor'
import type { WorkingState } from '../../contracts/working'
import { readTreeDescendants } from '../../model/index/read'

const isFrameView = (
  state: WorkingState,
  nodeId: NodeId
) => state.graph.nodes.get(nodeId)?.base.node.type === 'frame'

const readFrameRect = (
  state: WorkingState,
  nodeId: NodeId
) => {
  const view = state.graph.nodes.get(nodeId)
  return view?.base.node.type === 'frame'
    ? view.geometry.rect
    : undefined
}

const readFrameCandidates = (input: {
  state: WorkingState
  records: ReturnType<Query['spatial']['point']> | ReturnType<Query['spatial']['rect']>
}): readonly {
  id: NodeId
  rect: Rect
  order: number
}[] => input.records.flatMap((record) => {
  if (record.item.kind !== 'node') {
    return []
  }

  const rect = readFrameRect(input.state, record.item.id)
  return rect
    ? [{
        id: record.item.id,
        rect,
        order: record.order
      }]
    : []
})

export const createFrameRead = (input: {
  state: () => WorkingState
  spatial: Query['spatial']
}): Query['frame'] => ({
  point: (point) => input.spatial.point(point, {
    kinds: ['node']
  }).flatMap((record) => record.item.kind === 'node' && isFrameView(input.state(), record.item.id)
    ? [record.item.id]
    : []),
  rect: (rect) => input.spatial.rect(rect, {
    kinds: ['node']
  }).flatMap((record) => {
    if (record.item.kind !== 'node') {
      return []
    }

    const frameRect = readFrameRect(input.state(), record.item.id)
    return frameRect && geometryApi.rect.contains(frameRect, rect)
      ? [record.item.id]
      : []
  }),
  pick: (point, options) => nodeApi.frame.pick({
    candidates: readFrameCandidates({
      state: input.state(),
      records: input.spatial.point(point, {
        kinds: ['node']
      })
    }),
    point,
    excludeIds: options?.excludeIds?.length
      ? new Set(options.excludeIds)
      : undefined
  }),
  parent: (nodeId, options) => {
    const rect = input.state().graph.nodes.get(nodeId)?.geometry.rect
    if (!rect) {
      return undefined
    }

    return nodeApi.frame.pickParent({
      candidates: readFrameCandidates({
        state: input.state(),
        records: input.spatial.rect(rect, {
          kinds: ['node']
        })
      }),
      rect,
      nodeId,
      excludeIds: options?.excludeIds?.length
        ? new Set(options.excludeIds)
        : undefined
    })
  },
  descendants: (nodeIds) => readTreeDescendants(input.state().indexes, nodeIds)
})
