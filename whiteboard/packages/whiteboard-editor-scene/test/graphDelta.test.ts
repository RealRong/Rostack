import { describe, expect, it } from 'vitest'
import { idDelta } from '@shared/delta'
import { document as documentApi } from '@whiteboard/core/document'
import type {
  EdgeId,
  GroupId,
  NodeId,
  Size
} from '@whiteboard/core/types'
import { createEngine } from '@whiteboard/engine'
import { createWhiteboardMutationDelta } from '@whiteboard/engine/mutation'
import type { MutationDelta } from '@shared/mutation'
import type { Input } from '../src/contracts/editor'
import { createEmptyInput, createEmptyRuntimeInputDelta } from '../src/testing/input'
import {
  createMutationDelta,
  createEditorGraphLayout,
  type EditorGraphLayoutState
} from '../src/testing/builders'
import { createEditorSceneProjectionHarness } from '../src/testing/runtime'

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

const createGroup = (input: {
  engine: ReturnType<typeof createEngine>
  nodeIds: readonly NodeId[]
}): GroupId => {
  const result = input.engine.execute({
    type: 'group.merge',
    target: {
      nodeIds: input.nodeIds
    }
  })

  expect(result.ok).toBe(true)
  if (!result.ok) {
    throw new Error('failed to create group')
  }

  return result.data.groupId
}

const createInput = (input: {
  engine: ReturnType<typeof createEngine>
  delta: Input['runtime']['editor']['delta']
  documentDelta?: Input['delta'] | MutationDelta
  edit?: Input['runtime']['editor']['state']['edit']
  nodeMeasures?: ReadonlyMap<NodeId, Size>
}): Input => {
  currentMeasureState = {
    nodeMeasures: input.nodeMeasures
      ? new Map(
          [...input.nodeMeasures].map(([nodeId, size]) => [
            nodeId,
            {
              kind: 'size' as const,
              size
            }
          ])
        )
      : undefined
  }
  const value = createEmptyInput()
  value.document.rev = input.engine.rev()
  value.document.doc = input.engine.doc()
  value.runtime.editor.state.edit = input.edit ?? null
  value.runtime.editor.delta = input.delta
  value.delta = createWhiteboardMutationDelta(
    input.documentDelta ?? createMutationDelta()
  )
  return value
}

let currentMeasureState: EditorGraphLayoutState = {}

const createProjectionHarness = () => createEditorSceneProjectionHarness({
  layout: createEditorGraphLayout(
    () => currentMeasureState
  )
})

describe('graph delta patching', () => {
  it('does not synthesize unrelated graph or spatial order changes for edit-only runtime input', () => {
    const engine = createEngine({
      document: documentApi.create('doc_editor_graph_runtime_graph_delta'),
      layout: createEditorGraphLayout(() => currentMeasureState)
    })
    const firstId = createNode({
      engine,
      position: { x: 40, y: 40 },
      text: 'First',
      size: { width: 120, height: 44 }
    })
    const secondId = createNode({
      engine,
      position: { x: 260, y: 40 },
      text: 'Second',
      size: { width: 120, height: 44 }
    })
    createEdge({
      engine,
      sourceId: firstId,
      targetId: secondId
    })

    const runtime = createProjectionHarness()

    const bootstrapDelta = createEmptyRuntimeInputDelta()

    runtime.update(createInput({
        engine,
        delta: bootstrapDelta,
        documentDelta: createMutationDelta({
          reset: true
        }),
        nodeMeasures: new Map([
          [firstId, { width: 120, height: 44 }],
          [secondId, { width: 120, height: 44 }]
        ])
      }))

    const liveDelta = createEmptyRuntimeInputDelta()
    liveDelta.edit = true
    idDelta.update(liveDelta.preview.nodes, firstId)

    const live = runtime.update(createInput({
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

    expect(live.trace.phases[0]?.name).toBe('document')
    expect(runtime.working().phase.spatial.order).toBe(false)
    expect(runtime.working().phase.graph.entities.nodes.updated.has(secondId)).toBe(false)
  })

  it('marks spatial order without synthetic record updates on canvas order input', () => {
    const engine = createEngine({
      document: documentApi.create('doc_editor_graph_runtime_spatial_order'),
      layout: createEditorGraphLayout(() => currentMeasureState)
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

    const runtime = createProjectionHarness()

    const bootstrapDelta = createEmptyRuntimeInputDelta()

    runtime.update(createInput({
        engine,
        delta: bootstrapDelta,
        documentDelta: createMutationDelta({
          reset: true
        }),
        nodeMeasures: new Map([
          [firstId, { width: 120, height: 44 }],
          [secondId, { width: 120, height: 44 }]
        ])
      }))

    const reorder = engine.execute({
      type: 'canvas.order.move',
      refs: [{
        kind: 'node',
        id: firstId
      }],
      to: {
        kind: 'back'
      }
    })
    expect(reorder.ok).toBe(true)

    const orderDelta = createEmptyRuntimeInputDelta()

    const result = runtime.update(createInput({
        engine,
        delta: orderDelta,
        documentDelta: reorder.ok
          ? reorder.commit.delta
          : createMutationDelta(),
        nodeMeasures: new Map([
          [firstId, { width: 120, height: 44 }],
          [secondId, { width: 120, height: 44 }]
        ])
      }))

    expect(result.trace.phases.map((phase) => phase.name)).toEqual([
      'document',
      'graph',
      'spatial',
      'items',
      'ui',
      'render'
    ])
    expect(runtime.working().phase.spatial.order).toBe(true)
    expect(runtime.working().phase.spatial.records.added.size).toBe(0)
    expect(runtime.working().phase.spatial.records.updated.size).toBe(0)
    expect(runtime.working().phase.spatial.records.removed.size).toBe(0)
  })

  it('keeps group frame in graph while excluding group records from spatial state', () => {
    const engine = createEngine({
      document: documentApi.create('doc_editor_graph_runtime_spatial_group_boundary'),
      layout: createEditorGraphLayout(() => currentMeasureState)
    })
    const firstId = createNode({
      engine,
      position: { x: 40, y: 40 },
      text: 'First',
      size: { width: 120, height: 44 }
    })
    const secondId = createNode({
      engine,
      position: { x: 220, y: 40 },
      text: 'Second',
      size: { width: 120, height: 44 }
    })
    const groupId = createGroup({
      engine,
      nodeIds: [firstId, secondId]
    })

    const runtime = createProjectionHarness()

    const bootstrapDelta = createEmptyRuntimeInputDelta()

    runtime.update(createInput({
        engine,
        delta: bootstrapDelta,
        documentDelta: createMutationDelta({
          reset: true
        }),
        nodeMeasures: new Map([
          [firstId, { width: 120, height: 44 }],
          [secondId, { width: 120, height: 44 }]
        ])
      }))

    expect(runtime.working().graph.owners.groups.get(groupId)?.frame.bounds).toBeDefined()
    expect([...runtime.working().spatial.records.keys()]).toEqual([
      `node:${firstId}`,
      `node:${secondId}`
    ])
    expect([...runtime.working().spatial.records.keys()]).not.toContain(`group:${groupId}`)
  })
})
