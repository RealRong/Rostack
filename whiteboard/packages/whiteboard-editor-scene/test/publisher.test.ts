import { describe, expect, it } from 'vitest'
import { idDelta } from '@shared/projector/delta'
import { document as documentApi } from '@whiteboard/core/document'
import type {
  EdgeId,
  NodeId,
  Size
} from '@whiteboard/core/types'
import { createEngine } from '@whiteboard/engine'
import type { Input } from '../src/contracts/editor'
import {
  createEmptyInput,
  createEmptyInputDelta
} from '../src/projector/spec'
import { createEditorGraphTextMeasureEntry } from '../src/testing/builders'
import { createEditorGraphProjectorHarness } from '../src/testing/runtime'

const touchedIds = <TId extends string>(
  delta: {
    added: ReadonlySet<TId>
    updated: ReadonlySet<TId>
    removed: ReadonlySet<TId>
  }
): readonly TId[] => [...idDelta.touched(delta)]

const createNode = (input: {
  engine: ReturnType<typeof createEngine>
  position: { x: number; y: number }
  text: string
  size?: Size
}) => {
  const result = input.engine.execute({
    type: 'node.create',
    input: {
      type: 'text',
      position: input.position,
      size: input.size,
      data: {
        text: input.text
      }
    }
  })

  expect(result.ok).toBe(true)
  if (!result.ok) {
    throw new Error('failed to create node')
  }

  return result.data.nodeId
}

const createEdge = (input: {
  engine: ReturnType<typeof createEngine>
  sourceId: NodeId
  targetId: NodeId
}) => {
  const result = input.engine.execute({
    type: 'edge.create',
    input: {
      type: 'straight',
      source: {
        kind: 'node',
        nodeId: input.sourceId
      },
      target: {
        kind: 'node',
        nodeId: input.targetId
      }
    }
  })

  expect(result.ok).toBe(true)
  if (!result.ok) {
    throw new Error('failed to create edge')
  }

  return result.data.edgeId
}

const createInput = (input: {
  engine: ReturnType<typeof createEngine>
  delta: Input['delta']
  edit?: Input['session']['edit']
  selection?: Input['interaction']['selection']
  hover?: Input['interaction']['hover']
  nodeMeasures?: ReadonlyMap<NodeId, Size>
}): Input => {
  const value = createEmptyInput()

  value.document.snapshot = input.engine.current().snapshot
  value.delta = input.delta
  value.session.edit = input.edit ?? null
  value.interaction.selection = input.selection ?? {
    nodeIds: [],
    edgeIds: []
  }
  value.interaction.hover = input.hover ?? {
    kind: 'none'
  }
  value.measure.text.ready = (input.nodeMeasures?.size ?? 0) > 0
  value.measure.text.nodes = new Map(
    [...(input.nodeMeasures ?? new Map())].map(([nodeId, size]) => [
      nodeId,
      createEditorGraphTextMeasureEntry(size)
    ])
  )

  return value
}

const createProjectorHarness = () => createEditorGraphProjectorHarness()

describe('delta-driven publisher', () => {
  it('patches graph families by touched ids and reuses untouched graph entries', () => {
    const engine = createEngine({
      document: documentApi.create('doc_editor_graph_runtime_publish_graph_delta')
    })
    const firstId = createNode({
      engine,
      position: { x: 40, y: 40 },
      text: 'First',
      size: { width: 120, height: 44 }
    })
    const secondId = createNode({
      engine,
      position: { x: 240, y: 40 },
      text: 'Second',
      size: { width: 120, height: 44 }
    })
    const edgeId = createEdge({
      engine,
      sourceId: firstId,
      targetId: secondId
    })
    const runtime = createProjectorHarness()

    const bootstrapDelta = createEmptyInputDelta()
    bootstrapDelta.document.reset = true

    runtime.update(createInput({
        engine,
        delta: bootstrapDelta,
        nodeMeasures: new Map([
          [firstId, { width: 120, height: 44 }],
          [secondId, { width: 120, height: 44 }]
        ])
      }))

    const baseline = runtime.snapshot()
    const liveDelta = createEmptyInputDelta()
    liveDelta.graph.nodes.edit.updated.add(firstId)

    const result = runtime.update(createInput({
        engine,
        delta: liveDelta,
        edit: {
          kind: 'node',
          nodeId: firstId,
          field: 'text',
          text: 'First node with much wider live content',
          composing: false,
          caret: {
            kind: 'end'
          }
        },
        nodeMeasures: new Map([
          [firstId, { width: 220, height: 44 }],
          [secondId, { width: 120, height: 44 }]
        ])
      }))

    expect(touchedIds(result.change.graph.nodes)).toEqual([firstId])
    expect(touchedIds(result.change.graph.edges)).toEqual([edgeId])
    expect(touchedIds(result.change.graph.owners.mindmaps)).toEqual([])
    expect(touchedIds(result.change.graph.owners.groups)).toEqual([])
    expect(result.snapshot.graph.nodes.ids).toBe(baseline.graph.nodes.ids)
    expect(result.snapshot.graph.nodes.byId.get(firstId)).not.toBe(
      baseline.graph.nodes.byId.get(firstId)
    )
    expect(result.snapshot.graph.nodes.byId.get(secondId)).toBe(
      baseline.graph.nodes.byId.get(secondId)
    )
    expect(result.change.items.changed).toBe(false)
    expect(result.snapshot.items).toBe(baseline.items)
  })

  it('publishes canvas order updates through items only', () => {
    const engine = createEngine({
      document: documentApi.create('doc_editor_graph_runtime_publish_items_only')
    })
    const firstId = createNode({
      engine,
      position: { x: 40, y: 40 },
      text: 'First',
      size: { width: 120, height: 44 }
    })
    const secondId = createNode({
      engine,
      position: { x: 240, y: 40 },
      text: 'Second',
      size: { width: 120, height: 44 }
    })
    const runtime = createProjectorHarness()

    const bootstrapDelta = createEmptyInputDelta()
    bootstrapDelta.document.reset = true

    runtime.update(createInput({
        engine,
        delta: bootstrapDelta,
        nodeMeasures: new Map([
          [firstId, { width: 120, height: 44 }],
          [secondId, { width: 120, height: 44 }]
        ])
      }))

    const baseline = runtime.snapshot()
    const reorder = engine.execute({
      type: 'canvas.order.move',
      refs: [{
        kind: 'node',
        id: firstId
      }],
      mode: 'front'
    })
    expect(reorder.ok).toBe(true)

    const orderDelta = createEmptyInputDelta()
    orderDelta.document.order = true

    const result = runtime.update(createInput({
        engine,
        delta: orderDelta,
        nodeMeasures: new Map([
          [firstId, { width: 120, height: 44 }],
          [secondId, { width: 120, height: 44 }]
        ])
      }))

    expect(touchedIds(result.change.graph.nodes)).toEqual([])
    expect(touchedIds(result.change.graph.edges)).toEqual([])
    expect(touchedIds(result.change.ui.nodes)).toEqual([])
    expect(touchedIds(result.change.ui.edges)).toEqual([])
    expect(result.change.ui.chrome.changed).toBe(false)
    expect(result.change.items.changed).toBe(true)
    expect(result.snapshot.graph).toBe(baseline.graph)
    expect(result.snapshot.ui).toBe(baseline.ui)
    expect(result.snapshot.items).not.toBe(baseline.items)
    expect(result.snapshot.items).toEqual([
      {
        kind: 'node',
        id: secondId
      },
      {
        kind: 'node',
        id: firstId
      }
    ])
  })

  it('publishes selection-only updates through chrome and touched ids', () => {
    const engine = createEngine({
      document: documentApi.create('doc_editor_graph_runtime_publish_selection_only')
    })
    const firstId = createNode({
      engine,
      position: { x: 40, y: 40 },
      text: 'First',
      size: { width: 120, height: 44 }
    })
    const secondId = createNode({
      engine,
      position: { x: 240, y: 40 },
      text: 'Second',
      size: { width: 120, height: 44 }
    })
    const edgeId = createEdge({
      engine,
      sourceId: firstId,
      targetId: secondId
    })
    const runtime = createProjectorHarness()

    const bootstrapDelta = createEmptyInputDelta()
    bootstrapDelta.document.reset = true

    runtime.update(createInput({
        engine,
        delta: bootstrapDelta,
        nodeMeasures: new Map([
          [firstId, { width: 120, height: 44 }],
          [secondId, { width: 120, height: 44 }]
        ])
      }))

    const baseline = runtime.snapshot()
    const selectionDelta = createEmptyInputDelta()
    selectionDelta.ui.selection = true

    const result = runtime.update(createInput({
        engine,
        delta: selectionDelta,
        selection: {
          nodeIds: [firstId],
          edgeIds: [edgeId]
        },
        nodeMeasures: new Map([
          [firstId, { width: 120, height: 44 }],
          [secondId, { width: 120, height: 44 }]
        ])
      }))

    expect(touchedIds(result.change.graph.nodes)).toEqual([])
    expect(touchedIds(result.change.graph.edges)).toEqual([])
    expect(result.change.items.changed).toBe(false)
    expect(result.change.ui.chrome.changed).toBe(true)
    expect(touchedIds(result.change.ui.nodes)).toEqual([firstId])
    expect(touchedIds(result.change.ui.edges)).toEqual([edgeId])
    expect(result.snapshot.ui.chrome).not.toBe(baseline.ui.chrome)
    expect(result.snapshot.ui.nodes.byId.get(firstId)?.selected).toBe(true)
    expect(result.snapshot.ui.nodes.byId.get(secondId)).toBe(
      baseline.ui.nodes.byId.get(secondId)
    )
  })

  it('publishes hover-only updates through chrome and hovered node ui', () => {
    const engine = createEngine({
      document: documentApi.create('doc_editor_graph_runtime_publish_hover_only')
    })
    const nodeId = createNode({
      engine,
      position: { x: 40, y: 40 },
      text: 'Node',
      size: { width: 120, height: 44 }
    })
    const runtime = createProjectorHarness()

    const bootstrapDelta = createEmptyInputDelta()
    bootstrapDelta.document.reset = true

    runtime.update(createInput({
        engine,
        delta: bootstrapDelta,
        nodeMeasures: new Map([
          [nodeId, { width: 120, height: 44 }]
        ])
      }))

    const result = runtime.update(createInput({
        engine,
        delta: {
          ...createEmptyInputDelta(),
          ui: {
            ...createEmptyInputDelta().ui,
            hover: true
          }
        },
        hover: {
          kind: 'node',
          nodeId
        },
        nodeMeasures: new Map([
          [nodeId, { width: 120, height: 44 }]
        ])
      }))

    expect(touchedIds(result.change.graph.nodes)).toEqual([])
    expect(result.change.items.changed).toBe(false)
    expect(result.change.ui.chrome.changed).toBe(true)
    expect(touchedIds(result.change.ui.nodes)).toEqual([nodeId])
    expect(touchedIds(result.change.ui.edges)).toEqual([])
    expect(result.snapshot.ui.nodes.byId.get(nodeId)?.hovered).toBe(true)
  })

  it('reuses previous snapshot subtrees on idle updates', () => {
    const engine = createEngine({
      document: documentApi.create('doc_editor_graph_runtime_publish_idle_reuse')
    })
    const nodeId = createNode({
      engine,
      position: { x: 40, y: 40 },
      text: 'Node',
      size: { width: 120, height: 44 }
    })
    const runtime = createProjectorHarness()

    const bootstrapDelta = createEmptyInputDelta()
    bootstrapDelta.document.reset = true

    runtime.update(createInput({
        engine,
        delta: bootstrapDelta,
        nodeMeasures: new Map([
          [nodeId, { width: 120, height: 44 }]
        ])
      }))

    const baseline = runtime.snapshot()
    const result = runtime.update(createInput({
        engine,
        delta: createEmptyInputDelta(),
        nodeMeasures: new Map([
          [nodeId, { width: 120, height: 44 }]
        ])
      }))

    expect(touchedIds(result.change.graph.nodes)).toEqual([])
    expect(touchedIds(result.change.graph.edges)).toEqual([])
    expect(result.change.items.changed).toBe(false)
    expect(result.change.ui.chrome.changed).toBe(false)
    expect(touchedIds(result.change.ui.nodes)).toEqual([])
    expect(touchedIds(result.change.ui.edges)).toEqual([])
    expect(result.snapshot.graph).toBe(baseline.graph)
    expect(result.snapshot.items).toBe(baseline.items)
    expect(result.snapshot.ui).toBe(baseline.ui)
  })
})
