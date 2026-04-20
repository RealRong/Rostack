import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { createCanvasOrderCollectionApi } from '@whiteboard/core/kernel/reduce/collection/canvasOrder'
import { createEdgeLabelsCollectionApi } from '@whiteboard/core/kernel/reduce/collection/edgeLabels'
import { createEdgeRoutePointsCollectionApi } from '@whiteboard/core/kernel/reduce/collection/edgeRoutePoints'
import { createMindmapChildrenCollectionApi } from '@whiteboard/core/kernel/reduce/collection/mindmapChildren'

export const createCollectionApi = (
  tx: ReducerTx
) => ({
  canvas: {
    order: () => createCanvasOrderCollectionApi(tx)
  },
  edge: {
    labels: (edgeId: import('@whiteboard/core/types').EdgeId) => createEdgeLabelsCollectionApi(tx, edgeId),
    routePoints: (edgeId: import('@whiteboard/core/types').EdgeId) => createEdgeRoutePointsCollectionApi(tx, edgeId)
  },
  mindmap: {
    children: (
      mindmapId: import('@whiteboard/core/types').MindmapId,
      parentId: import('@whiteboard/core/types').NodeId
    ) => createMindmapChildrenCollectionApi(tx, mindmapId, parentId)
  }
})
