import { describe, expect, it } from 'vitest'
import {
  clearNodeTextPreviewSize,
  updateNodeTextPreview
} from '../src/state/preview-node'

describe('clearNodeTextPreviewSize', () => {
  it('clears measured preview geometry and preserves transform inputs', () => {
    const state = updateNodeTextPreview(
      {
        patches: []
      },
      'text-1',
      {
        position: {
          x: 10,
          y: 20
        },
        size: {
          width: 180,
          height: 64
        },
        mode: 'wrap',
        wrapWidth: 180,
        handle: 'e'
      }
    )

    expect(clearNodeTextPreviewSize(state, 'text-1')).toEqual({
      patches: [{
        id: 'text-1',
        patch: {
          mode: 'wrap',
          wrapWidth: 180,
          handle: 'e'
        }
      }]
    })
  })
})
