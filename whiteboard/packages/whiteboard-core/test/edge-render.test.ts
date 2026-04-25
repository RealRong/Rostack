import { describe, expect, it } from 'vitest'
import { edge as edgeApi } from '@whiteboard/core/edge'

describe('edge render primitive', () => {
  it('normalizes static edge style and generates stable style keys', () => {
    expect(edgeApi.render.staticStyle({
      color: '#f00'
    })).toEqual({
      color: '#f00',
      width: 2,
      opacity: 1,
      dash: undefined,
      start: undefined,
      end: undefined
    })

    expect(edgeApi.render.styleKey(undefined)).toBe(
      edgeApi.render.styleKey({
        width: 2,
        opacity: 1
      })
    )
    expect(edgeApi.render.styleKey({
      color: '#f00',
      width: 3,
      opacity: 0.5,
      dash: 'dashed',
      start: 'arrow',
      end: 'bar'
    })).toBe('#f00|3|0.5|dashed|arrow|bar')
  })
})

describe('edge hit primitive', () => {
  it('computes distance to polyline paths', () => {
    expect(edgeApi.hit.distanceToPath({
      path: {
        points: [{
          x: 0,
          y: 0
        }, {
          x: 10,
          y: 0
        }],
        segments: []
      },
      point: {
        x: 5,
        y: 3
      }
    })).toBe(3)
  })

  it('uses segment hit points when present', () => {
    expect(edgeApi.hit.distanceToPath({
      path: {
        points: [],
        segments: [{
          from: {
            x: 0,
            y: 0
          },
          to: {
            x: 10,
            y: 10
          },
          role: 'control',
          insertIndex: 0,
          hitPoints: [{
            x: 0,
            y: 0
          }, {
            x: 10,
            y: 0
          }]
        }]
      },
      point: {
        x: 6,
        y: 2
      }
    })).toBe(2)
  })
})
