import { describe, expect, it } from 'vitest'
import { edge as edgeApi } from '@whiteboard/core/edge'

describe('buildEdgeLabelMaskRect', () => {
  it('expands the measured label box into a centered mask rect', () => {
    expect(edgeApi.label.mask({
      center: {
        x: 100,
        y: 50
      },
      size: {
        width: 60,
        height: 20
      }
    })).toEqual({
      x: 70,
      y: 40,
      width: 60,
      height: 20,
      radius: 0,
      center: {
        x: 100,
        y: 50
      },
      angle: 0
    })
  })

  it('returns a rotate transform when the label follows the edge tangent', () => {
    expect(edgeApi.label.maskTransform({
      angle: 32,
      center: {
        x: 140,
        y: 72
      }
    })).toBe('rotate(32 140 72)')
  })
})
