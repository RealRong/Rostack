import { describe, expect, it } from 'vitest'
import {
  readChangedPreviewEdgeIds,
  readPreviewEdgeIds
} from '../src/projection/adapter'
import type { EditorInputPreviewState } from '../src/session/preview/types'

const createPreviewState = (): EditorInputPreviewState => ({
  node: {
    text: {
      patches: []
    }
  },
  edge: {},
  draw: {
    preview: null,
    hidden: []
  },
  selection: {
    node: {
      patches: []
    },
    edge: [],
    guides: []
  },
  mindmap: {}
})

describe('projection adapter edge preview', () => {
  it('reads preview edge ids from selection edge feedback entries', () => {
    const preview = createPreviewState()
    preview.selection.edge = [{
      id: 'edge-1',
      patch: {
        route: {
          kind: 'manual',
          points: []
        }
      },
      activeRouteIndex: 2
    }]

    expect(readPreviewEdgeIds(preview)).toEqual(new Set(['edge-1']))
  })

  it('detects changed edge preview when only activeRouteIndex changes', () => {
    const previous = createPreviewState()
    previous.selection.edge = [{
      id: 'edge-1',
      activeRouteIndex: 1
    }]
    const next = createPreviewState()
    next.selection.edge = [{
      id: 'edge-1',
      activeRouteIndex: 2
    }]

    expect(readChangedPreviewEdgeIds({
      previous,
      next
    })).toEqual(new Set(['edge-1']))
  })
})
