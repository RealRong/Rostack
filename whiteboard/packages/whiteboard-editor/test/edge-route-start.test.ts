import { describe, expect, it } from 'vitest'
import { entityTable } from '@shared/core'
import { edge as edgeApi } from '@whiteboard/core/edge'
import type { Edge } from '@whiteboard/core/types'
import {
  startEdgeRoutePoint,
  stepEdgeRoute
} from '../src/input/features/edge/route'

const createManualRouteEdge = (): Edge => ({
  id: 'edge-1',
  type: 'straight',
  source: {
    kind: 'point',
    point: { x: 0, y: 0 }
  },
  target: {
    kind: 'point',
    point: { x: 100, y: 100 }
  },
  points: entityTable.normalize.list([{
      id: 'point-1',
      x: 20,
      y: 20
    }])
})

describe('stepEdgeRoute', () => {
  it('keeps anchor preview patch while the pointer is stationary', () => {
    const edge = createManualRouteEdge()
    const first = stepEdgeRoute({
      state: startEdgeRoutePoint({
        edgeId: edge.id,
        index: 0,
        pointerId: 1,
        startWorld: { x: 0, y: 0 },
        origin: { x: 20, y: 20 }
      }),
      edge,
      pointerWorld: { x: 10, y: 15 }
    })

    const second = stepEdgeRoute({
      state: first.state,
      edge,
      pointerWorld: { x: 10, y: 15 }
    })

    expect(first.draft?.patch).toBeDefined()
    expect(second.draft?.patch).toBeDefined()
    expect(edgeApi.patch.apply(edge, second.draft?.patch).points).toEqual(
      entityTable.normalize.list([{
        id: 'point-1',
        x: 30,
        y: 35
      }])
    )
  })

  it('does not emit a preview patch when the anchor stays at its origin', () => {
    const edge = createManualRouteEdge()
    const result = stepEdgeRoute({
      state: startEdgeRoutePoint({
        edgeId: edge.id,
        index: 0,
        pointerId: 1,
        startWorld: { x: 0, y: 0 },
        origin: { x: 20, y: 20 }
      }),
      edge,
      pointerWorld: { x: 0, y: 0 }
    })

    expect(result.draft?.patch).toBeUndefined()
  })
})
