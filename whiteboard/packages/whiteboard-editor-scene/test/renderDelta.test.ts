import { describe, expect, it } from 'vitest'
import type {
  Edge,
  Point,
  Rect,
  Size
} from '@whiteboard/core/types'
import type {
  EdgeView,
  EdgeLabelView as GraphEdgeLabelView,
  Input
} from '../src/contracts/editor'
import {
  sceneItemKey
} from '../src/contracts/delta'
import {
  createEmptyEditorSceneFacts
} from '../src/contracts/facts'
import { patchRenderState } from '../src/model/render/patch'
import { createWorking } from '../src/projection/state'
import { createEmptyInput } from '../src/testing/input'

const POINT: Point = {
  x: 0,
  y: 0
}

const RECT: Rect = {
  x: 0,
  y: 0,
  width: 40,
  height: 20
}

const SIZE: Size = {
  width: 40,
  height: 20
}

const createCurrentInput = (): Input => createEmptyInput()

const createEdgeLabel = (input: {
  labelId: string
  text: string
  maskRect?: Partial<GraphEdgeLabelView['maskRect']>
}): GraphEdgeLabelView => ({
  labelId: input.labelId,
  text: input.text,
  displayText: input.text,
  style: {} as NonNullable<Edge['labels']>[number]['style'],
  size: SIZE,
  point: POINT,
  angle: 0,
  rect: RECT,
  maskRect: {
    x: 0,
    y: 0,
    width: 40,
    height: 20,
    radius: 4,
    angle: 0,
    center: POINT,
    ...input.maskRect
  }
})

const createEdgeView = (input: {
  edgeId: string
  color: string
  svgPath: string
  labels?: readonly GraphEdgeLabelView[]
}): EdgeView => {
  const edge: Edge = {
    id: input.edgeId,
    type: 'straight',
    style: {
      color: input.color
    },
    source: {
      kind: 'point',
      point: POINT
    },
    target: {
      kind: 'point',
      point: {
        x: 100,
        y: 0
      }
    }
  }

  return {
    base: {
      edge,
      nodes: {}
    },
    route: {
      points: [],
      segments: [],
      svgPath: input.svgPath,
      handles: [],
      labels: input.labels ?? []
    }
  }
}

const setEdgeItems = (
  edgeIds: readonly string[]
) => {
  const ids = edgeIds.map((edgeId) => sceneItemKey.write({
    kind: 'edge',
    id: edgeId
  }))
  const byId = new Map(
    edgeIds.map((edgeId) => [
      sceneItemKey.write({
        kind: 'edge',
        id: edgeId
      }),
      {
        kind: 'edge',
        id: edgeId
      }
    ])
  )

  return {
    ids,
    byId
  }
}

const resetPhaseDeltas = (
  working: ReturnType<typeof createWorking>
) => {
  working.facts = createEmptyEditorSceneFacts()
  working.delta.items = 'skip'
}

const markRenderEdges = (
  working: ReturnType<typeof createWorking>,
  ...edgeIds: readonly string[]
) => {
  const touched = new Set(edgeIds)
  working.facts.graph.edge.entity = new Set(touched)
}

const markUiEdge = (
  working: ReturnType<typeof createWorking>,
  ...edgeIds: readonly string[]
) => {
  const touched = new Set(edgeIds)
  working.facts.ui.edge = new Set([
    ...working.facts.ui.edge,
    ...touched
  ])
}

describe('render delta patching', () => {
  it('patches only the touched static bucket', () => {
    const working = createWorking()
    const edgeA = 'edge_a'
    const edgeB = 'edge_b'
    const edgeC = 'edge_c'

    working.graph.edges.set(edgeA, createEdgeView({
      edgeId: edgeA,
      color: 'red',
      svgPath: 'M0 0L10 0'
    }))
    working.graph.edges.set(edgeB, createEdgeView({
      edgeId: edgeB,
      color: 'blue',
      svgPath: 'M0 0L20 0'
    }))
    working.graph.edges.set(edgeC, createEdgeView({
      edgeId: edgeC,
      color: 'red',
      svgPath: 'M0 0L30 0'
    }))
    working.items = setEdgeItems([edgeA, edgeB, edgeC])

    markRenderEdges(working, edgeA, edgeB, edgeC)

    patchRenderState({
      working,
      current: createCurrentInput(),
      reset: false
    })

    const redStaticId = working.render.statics.staticIdByEdge.get(edgeA)!
    const blueStaticId = working.render.statics.staticIdByEdge.get(edgeB)!
    const previousBlueBucket = working.render.statics.byId.get(blueStaticId)

    resetPhaseDeltas(working)
    working.graph.edges.set(edgeA, createEdgeView({
      edgeId: edgeA,
      color: 'red',
      svgPath: 'M0 0L11 0'
    }))
    markRenderEdges(working, edgeA)

    patchRenderState({
      working,
      current: createCurrentInput(),
      reset: false
    })

    expect(working.delta.render.edge.statics).toEqual({
      set: [[redStaticId, working.render.statics.byId.get(redStaticId)!]]
    })
    expect(working.render.statics.byId.get(blueStaticId)).toBe(previousBlueBucket)
  })

  it('marks statics ids only when bucket order changes', () => {
    const working = createWorking()
    const edgeA = 'edge_order_a'
    const edgeB = 'edge_order_b'

    working.graph.edges.set(edgeA, createEdgeView({
      edgeId: edgeA,
      color: 'red',
      svgPath: 'M0 0L10 0'
    }))
    working.graph.edges.set(edgeB, createEdgeView({
      edgeId: edgeB,
      color: 'blue',
      svgPath: 'M0 0L20 0'
    }))
    working.items = setEdgeItems([edgeA, edgeB])

    markRenderEdges(working, edgeA, edgeB)

    patchRenderState({
      working,
      current: createCurrentInput(),
      reset: false
    })

    const previousIds = working.render.statics.ids

    resetPhaseDeltas(working)
    working.items = setEdgeItems([edgeB, edgeA])
    working.delta.items = {
      ids: working.items.ids
    }
    working.facts.items.touched = new Set(working.items.ids)

    patchRenderState({
      working,
      current: createCurrentInput(),
      reset: false
    })

    expect(working.delta.render.edge.statics).toEqual({
      ids: working.render.statics.ids
    })
    expect(working.render.statics.ids).not.toEqual(previousIds)
  })

  it('patches labels only for touched edges', () => {
    const working = createWorking()
    const edgeA = 'edge_label_a'
    const edgeB = 'edge_label_b'

    working.graph.edges.set(edgeA, createEdgeView({
      edgeId: edgeA,
      color: 'red',
      svgPath: 'M0 0L10 0',
      labels: [
        createEdgeLabel({
          labelId: 'label_a',
          text: 'A'
        })
      ]
    }))
    working.graph.edges.set(edgeB, createEdgeView({
      edgeId: edgeB,
      color: 'blue',
      svgPath: 'M0 0L20 0',
      labels: [
        createEdgeLabel({
          labelId: 'label_b',
          text: 'B'
        })
      ]
    }))
    working.items = setEdgeItems([edgeA, edgeB])
    working.ui.edges.set(edgeA, {
      selected: false,
      patched: false,
      labels: new Map()
    })
    working.ui.edges.set(edgeB, {
      selected: false,
      patched: false,
      labels: new Map()
    })

    markRenderEdges(working, edgeA, edgeB)

    patchRenderState({
      working,
      current: createCurrentInput(),
      reset: false
    })

    const labelKeyA = `${edgeA}:label_a` as const
    const labelKeyB = `${edgeB}:label_b` as const
    const previousLabelB = working.render.labels.byId.get(labelKeyB)

    resetPhaseDeltas(working)
    working.ui.edges.set(edgeA, {
      selected: true,
      patched: false,
      labels: new Map()
    })
    markUiEdge(working, edgeA)

    patchRenderState({
      working,
      current: createCurrentInput(),
      reset: false
    })

    expect(working.delta.render.edge.labels).toEqual({
      set: [[labelKeyA, working.render.labels.byId.get(labelKeyA)!]]
    })
    expect(working.render.labels.byId.get(labelKeyB)).toBe(previousLabelB)
  })

  it('patches masks only for touched edges', () => {
    const working = createWorking()
    const edgeA = 'edge_mask_a'
    const edgeB = 'edge_mask_b'

    working.graph.edges.set(edgeA, createEdgeView({
      edgeId: edgeA,
      color: 'red',
      svgPath: 'M0 0L10 0',
      labels: [
        createEdgeLabel({
          labelId: 'label_a',
          text: 'A'
        })
      ]
    }))
    working.graph.edges.set(edgeB, createEdgeView({
      edgeId: edgeB,
      color: 'blue',
      svgPath: 'M0 0L20 0',
      labels: [
        createEdgeLabel({
          labelId: 'label_b',
          text: 'B'
        })
      ]
    }))
    working.items = setEdgeItems([edgeA, edgeB])

    markRenderEdges(working, edgeA, edgeB)

    patchRenderState({
      working,
      current: createCurrentInput(),
      reset: false
    })

    const previousMaskB = working.render.masks.byId.get(edgeB)

    resetPhaseDeltas(working)
    working.graph.edges.set(edgeA, createEdgeView({
      edgeId: edgeA,
      color: 'red',
      svgPath: 'M0 0L10 0',
      labels: [
        createEdgeLabel({
          labelId: 'label_a',
          text: 'A',
          maskRect: {
            width: 48
          }
        })
      ]
    }))
    markRenderEdges(working, edgeA)

    patchRenderState({
      working,
      current: createCurrentInput(),
      reset: false
    })

    expect(working.delta.render.edge.masks).toEqual({
      set: [[edgeA, working.render.masks.byId.get(edgeA)!]]
    })
    expect(working.render.masks.byId.get(edgeB)).toBe(previousMaskB)
  })
})
