import { describe, expect, it } from 'vitest'
import { getEdgePath } from '@whiteboard/core/edge'
import type { Edge } from '@whiteboard/core/types'

const createEdge = (
  type: Edge['type']
): Edge => ({
  id: 'edge-1',
  type,
  source: {
    kind: 'point',
    point: {
      x: 0,
      y: 0
    }
  },
  target: {
    kind: 'point',
    point: {
      x: 120,
      y: 80
    }
  },
  route: {
    kind: 'auto'
  }
})

describe('getEdgePath', () => {
  it('builds rounded svg commands for fillet edges', () => {
    const result = getEdgePath({
      edge: createEdge('fillet'),
      source: {
        point: {
          x: 0,
          y: 0
        }
      },
      target: {
        point: {
          x: 120,
          y: 80
        }
      }
    })

    expect(result.points).toEqual([
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 80 },
      { x: 120, y: 80 }
    ])
    expect(result.svgPath).toContain('Q')
  })
})
