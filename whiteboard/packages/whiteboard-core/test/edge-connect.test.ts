import { describe, expect, it } from 'vitest'
import { edge as edgeApi } from '@whiteboard/core/edge'

describe('edge.connect', () => {
  it('builds preview path from core connect state', () => {
    const state = edgeApi.connect.startCreate({
      pointerId: 1,
      edgeType: 'elbow',
      from: edgeApi.connect.toDraftEnd({
        x: 0,
        y: 0
      }),
      to: edgeApi.connect.toDraftEnd({
        x: 120,
        y: 40
      })
    })

    const preview = edgeApi.connect.previewPath({
      state,
      readNodeGeometry: () => undefined
    })

    expect(preview).toBeDefined()
    expect(preview?.svgPath).toContain('M')
  })

  it('projects reconnect patch and snapped world in core', () => {
    const state = edgeApi.connect.project({
      state: edgeApi.connect.startReconnect({
        pointerId: 1,
        edgeId: 'edge-1',
        end: 'target',
        from: edgeApi.connect.toDraftEnd({
          x: 0,
          y: 0
        })
      }),
      evaluation: {
        focusedNodeId: undefined,
        resolution: {
          mode: 'free',
          pointWorld: {
            x: 10,
            y: 2
          }
        }
      }
    })

    const draftPatch = edgeApi.connect.reconnectDraftPatch({
      state,
      shift: true,
      allowLatch: true
    })
    expect(draftPatch).toEqual({
      type: 'straight',
      points: undefined
    })

    const world = edgeApi.connect.reconnectWorld({
      state,
      world: {
        x: 10,
        y: 2
      },
      fixedPoint: {
        x: 0,
        y: 0
      },
      shift: true,
      draftPatch
    })
    expect(world.x).toBeCloseTo(Math.hypot(10, 2))
    expect(world.y).toBeCloseTo(0)

    expect(edgeApi.connect.reconnectPatch({
      state,
      draftPatch
    })).toEqual({
      target: {
        kind: 'point',
        point: {
          x: 10,
          y: 2
        }
      },
      type: 'straight',
      points: undefined
    })
  })
})
