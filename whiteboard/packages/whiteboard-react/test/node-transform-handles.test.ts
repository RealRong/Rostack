import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EDGE_RESIZE_DIRECTIONS,
  DEFAULT_VISIBLE_RESIZE_DIRECTIONS,
  resolveNodeEdgeResizeDirections,
  resolveTransformChromeScreenSize,
  resolveTransformEdgeHitAreaStyle
} from '../src/features/node/components/NodeTransformHandles'

describe('NodeTransformHandles direction config', () => {
  it('keeps visible resize handles on the four corners only', () => {
    expect(DEFAULT_VISIBLE_RESIZE_DIRECTIONS).toEqual([
      'nw',
      'ne',
      'se',
      'sw'
    ])
  })

  it('keeps full edge resize interaction for regular nodes', () => {
    expect(resolveNodeEdgeResizeDirections('shape')).toEqual(
      DEFAULT_EDGE_RESIZE_DIRECTIONS
    )
  })

  it('limits text edge resize interaction to east and west', () => {
    expect(resolveNodeEdgeResizeDirections('text')).toEqual([
      'e',
      'w'
    ])
  })
})

describe('resolveTransformEdgeHitAreaStyle', () => {
  it('eases visible transform chrome with sqrt zoom and clamps extremes', () => {
    expect(resolveTransformChromeScreenSize({
      zoom: 0.25,
      base: 12,
      min: 8,
      max: 14
    })).toBe(8)

    expect(resolveTransformChromeScreenSize({
      zoom: 1,
      base: 12,
      min: 8,
      max: 14
    })).toBe(12)

    expect(resolveTransformChromeScreenSize({
      zoom: 4,
      base: 12,
      min: 8,
      max: 14
    })).toBe(14)
  })

  it('creates a top edge hit area with corner padding', () => {
    expect(resolveTransformEdgeHitAreaStyle({
      direction: 'n',
      rect: {
        width: 120,
        height: 80
      },
      zoom: 2
    })).toEqual({
      left: 7.5,
      top: -4,
      width: 105,
      height: 8
    })
  })

  it('keeps a usable hit area even for narrow bounds', () => {
    expect(resolveTransformEdgeHitAreaStyle({
      direction: 'e',
      rect: {
        width: 10,
        height: 20
      },
      zoom: 1
    })).toEqual({
      left: 2,
      top: 2,
      width: 16,
      height: 16
    })
  })
})
