import { describe, expect, it } from 'vitest'
import { idDelta } from '@shared/delta'
import type {
  Edge,
  EdgeId,
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
  createGraphDirty,
  createItemsDelta,
  sceneItemKey,
  uiChange
} from '../src/contracts/delta'
import { patchRenderState } from '../src/model/render/patch'
import { createWorking } from '../src/runtime/state'
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
  edgeId: EdgeId
  color: string
  svgPath: string
  labels?: readonly GraphEdgeLabelView[]
}): EdgeView => ({
  base: {
    edge: {
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
    } as unknown as Edge,
    nodes: {}
  },
  route: {
    points: [],
    segments: [],
    svgPath: input.svgPath,
    handles: [],
    labels: input.labels ?? []
  }
})

const setEdgeItems = (
  edgeIds: readonly EdgeId[]
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
  working.dirty.graph = createGraphDirty()
  working.delta.items = createItemsDelta()
  working.delta.ui = uiChange.create()
}

describe('render delta patching', () => {
  it('patches only the touched static bucket', () => {
    const working = createWorking()
    const edgeA = 'edge_a' as EdgeId
    const edgeB = 'edge_b' as EdgeId
    const edgeC = 'edge_c' as EdgeId

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

    idDelta.add(working.dirty.graph.edge.lifecycle, edgeA)
    idDelta.add(working.dirty.graph.edge.lifecycle, edgeB)
    idDelta.add(working.dirty.graph.edge.lifecycle, edgeC)

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
    idDelta.update(working.dirty.graph.edge.route, edgeA)

    patchRenderState({
      working,
      current: createCurrentInput(),
      reset: false
    })

    expect(working.delta.render.edge.statics.updated).toEqual(new Set([
      redStaticId
    ]))
    expect(working.delta.render.edge.statics.added.size).toBe(0)
    expect(working.delta.render.edge.statics.removed.size).toBe(0)
    expect(working.delta.render.edge.staticsIds).toBe(false)
    expect(working.render.statics.byId.get(blueStaticId)).toBe(previousBlueBucket)
  })

  it('marks statics ids only when bucket order changes', () => {
    const working = createWorking()
    const edgeA = 'edge_order_a' as EdgeId
    const edgeB = 'edge_order_b' as EdgeId

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

    idDelta.add(working.dirty.graph.edge.lifecycle, edgeA)
    idDelta.add(working.dirty.graph.edge.lifecycle, edgeB)

    patchRenderState({
      working,
      current: createCurrentInput(),
      reset: false
    })

    const previousIds = working.render.statics.ids

    resetPhaseDeltas(working)
    working.items = setEdgeItems([edgeB, edgeA])
    working.delta.items.change = {
      order: true,
      set: [
        `edge:${edgeA}`,
        `edge:${edgeB}`
      ]
    }

    patchRenderState({
      working,
      current: createCurrentInput(),
      reset: false
    })

    expect(working.delta.render.edge.staticsIds).toBe(true)
    expect(working.delta.render.edge.statics.added.size).toBe(0)
    expect(working.delta.render.edge.statics.updated.size).toBe(0)
    expect(working.delta.render.edge.statics.removed.size).toBe(0)
    expect(working.render.statics.ids).not.toEqual(previousIds)
  })

  it('patches labels only for touched edges', () => {
    const working = createWorking()
    const edgeA = 'edge_label_a' as EdgeId
    const edgeB = 'edge_label_b' as EdgeId

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

    idDelta.add(working.dirty.graph.edge.lifecycle, edgeA)
    idDelta.add(working.dirty.graph.edge.lifecycle, edgeB)

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
    idDelta.update(working.delta.ui.edge, edgeA)

    patchRenderState({
      working,
      current: createCurrentInput(),
      reset: false
    })

    expect(working.delta.render.edge.labels.updated).toEqual(new Set([
      labelKeyA
    ]))
    expect(working.delta.render.edge.labels.added.size).toBe(0)
    expect(working.delta.render.edge.labels.removed.size).toBe(0)
    expect(working.delta.render.edge.labelsIds).toBe(false)
    expect(working.render.labels.byId.get(labelKeyB)).toBe(previousLabelB)
  })

  it('patches masks only for touched edges', () => {
    const working = createWorking()
    const edgeA = 'edge_mask_a' as EdgeId
    const edgeB = 'edge_mask_b' as EdgeId

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

    idDelta.add(working.dirty.graph.edge.lifecycle, edgeA)
    idDelta.add(working.dirty.graph.edge.lifecycle, edgeB)

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
    idDelta.update(working.dirty.graph.edge.labels, edgeA)

    patchRenderState({
      working,
      current: createCurrentInput(),
      reset: false
    })

    expect(working.delta.render.edge.masks.updated).toEqual(new Set([
      edgeA
    ]))
    expect(working.delta.render.edge.masks.added.size).toBe(0)
    expect(working.delta.render.edge.masks.removed.size).toBe(0)
    expect(working.delta.render.edge.masksIds).toBe(false)
    expect(working.render.masks.byId.get(edgeB)).toBe(previousMaskB)
  })
})
