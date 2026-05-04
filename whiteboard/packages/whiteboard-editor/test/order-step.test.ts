import { describe, expect, it } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import type { CanvasItemRef } from '@whiteboard/core/types'
import {
  planCanvasOrderMove,
  planCanvasOrderStep
} from '../src/write/orderStep'

const toRefKey = (
  ref: CanvasItemRef
) => `${ref.kind}:${ref.id}`

const applyOps = (
  order: readonly CanvasItemRef[],
  ops: readonly {
    refs: readonly CanvasItemRef[]
    to: {
      kind: 'front' | 'back' | 'before' | 'after'
      ref?: CanvasItemRef
    }
  }[]
) => {
  let current = [...order]

  ops.forEach((op) => {
    const movedKeys = new Set(op.refs.map(toRefKey))
    const moved = current.filter((ref) => movedKeys.has(toRefKey(ref)))
    const filtered = current.filter((ref) => !movedKeys.has(toRefKey(ref)))
    const anchorIndex = op.to.kind === 'front'
      ? 0
      : op.to.kind === 'back'
        ? filtered.length
        : (() => {
            const index = filtered.findIndex((entry) => (
              op.to.ref && toRefKey(entry) === toRefKey(op.to.ref)
            ))
            if (index < 0) {
              return op.to.kind === 'before'
                ? 0
                : filtered.length
            }
            return op.to.kind === 'before'
              ? index
              : index + 1
          })()

    current = [
      ...filtered.slice(0, anchorIndex),
      ...moved,
      ...filtered.slice(anchorIndex)
    ]
  })

  return current
}

const createFrameOrderDocument = () => {
  const document = documentApi.create('doc_editor_order_step_frame')
  document.nodes.frame = {
    id: 'frame',
    type: 'frame',
    position: {
      x: 0,
      y: 0
    },
    size: {
      width: 240,
      height: 180
    }
  }
  document.nodes.child = {
    id: 'child',
    type: 'shape',
    position: {
      x: 40,
      y: 40
    },
    size: {
      width: 80,
      height: 60
    }
  }
  document.nodes.other = {
    id: 'other',
    type: 'shape',
    position: {
      x: 320,
      y: 40
    },
    size: {
      width: 80,
      height: 60
    }
  }
  document.order = [
    {
      kind: 'node',
      id: 'frame'
    },
    {
      kind: 'node',
      id: 'child'
    },
    {
      kind: 'node',
      id: 'other'
    }
  ]

  return document
}

describe('order planning', () => {
  it('interprets bring to front using the visible topmost direction', () => {
    const document = createFrameOrderDocument()
    const ops = planCanvasOrderMove({
      document,
      refs: [{
        kind: 'node',
        id: 'frame'
      }],
      to: {
        kind: 'front'
      }
    })

    expect(applyOps(document.order, ops).map(toRefKey)).toEqual([
      'node:child',
      'node:other',
      'node:frame'
    ])
  })

  it('keeps frame children behind the frame boundary when sending backward', () => {
    const document = createFrameOrderDocument()
    const ops = planCanvasOrderMove({
      document,
      refs: [{
        kind: 'node',
        id: 'child'
      }],
      to: {
        kind: 'back'
      }
    })

    expect(applyOps(document.order, ops).map(toRefKey)).toEqual([
      'node:frame',
      'node:child',
      'node:other'
    ])
  })

  it('prevents backward stepping across the containing frame', () => {
    const document = createFrameOrderDocument()
    const ops = planCanvasOrderStep({
      document,
      refs: [{
        kind: 'node',
        id: 'child'
      }],
      direction: 'backward'
    })

    expect(ops).toEqual([])
  })
})
