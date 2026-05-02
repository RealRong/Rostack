import { describe, expect, it } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import type { Guide } from '@whiteboard/core/node'
import type {
  EdgeId,
  NodeId,
  Size
} from '@whiteboard/core/types'
import { createEngine } from '@whiteboard/engine'
import {
  type Result
} from '../src'
import {
  createEditorRuntimeDelta,
  createMutationDelta,
  createEditorGraphLayout,
  type EditorGraphLayoutState
} from '../src/testing/builders'
import {
  createEditorSceneHarness
} from '../src/testing/runtime'
import {
  createEmptyInput,
} from '../src/testing/input'
import type { SceneUpdateInput } from '../src/contracts/editor'
import {
  createProjectionRuntime
} from '../src/projection/createProjectionRuntime'

type RuntimeInputOptions = {
  edit?: SceneUpdateInput['editor']['snapshot']['state']['edit']
  nodeMeasures?: ReadonlyMap<NodeId, Size>
  edgeLabelMeasures?: ReadonlyMap<EdgeId, ReadonlyMap<string, Size>>
  selection?: SceneUpdateInput['editor']['snapshot']['state']['selection']
  hover?: SceneUpdateInput['editor']['snapshot']['overlay']['hover']
  draw?: SceneUpdateInput['editor']['snapshot']['overlay']['preview']['draw']
  edgeGuide?: SceneUpdateInput['editor']['snapshot']['overlay']['preview']['edgeGuide']
  marquee?: SceneUpdateInput['editor']['snapshot']['overlay']['preview']['selection']['marquee']
  guides?: readonly Guide[]
  mindmapPreview?: SceneUpdateInput['editor']['snapshot']['overlay']['preview']['mindmap']
  delta?: SceneUpdateInput['editor']['delta']
  documentDelta?: SceneUpdateInput['document']['delta']
}

let currentMeasureState: EditorGraphLayoutState = {}

const toNodeMeasureMap = (
  input?: ReadonlyMap<NodeId, Size>
): ReadonlyMap<NodeId, EditorGraphLayoutState['nodeMeasures'] extends ReadonlyMap<NodeId, infer TValue> ? TValue : never> | undefined => input
  ? new Map(
      [...input].map(([nodeId, size]) => [
        nodeId,
        {
          kind: 'size' as const,
          size
        }
      ])
    )
  : undefined

const setCurrentMeasureState = (
  input: Pick<RuntimeInputOptions, 'nodeMeasures' | 'edgeLabelMeasures'> = {}
) => {
  currentMeasureState = {
    nodeMeasures: toNodeMeasureMap(input.nodeMeasures),
    edgeLabelMeasures: input.edgeLabelMeasures
  }
}

const layout = createEditorGraphLayout(
  () => currentMeasureState
)

const TEST_SCENE_VIEW = () => ({
  zoom: 1,
  center: {
    x: 0,
    y: 0
  },
  worldRect: {
    x: 0,
    y: 0,
    width: 0,
    height: 0
  }
})

const createRuntime = () => createProjectionRuntime({
  layout,
  view: TEST_SCENE_VIEW
})

const createHarness = () => createEditorSceneHarness({
  layout
})

const createInput = (
  engine: ReturnType<typeof createEngine>,
  options: RuntimeInputOptions = {}
): SceneUpdateInput => {
  setCurrentMeasureState({
    nodeMeasures: options.nodeMeasures,
    edgeLabelMeasures: options.edgeLabelMeasures
  })

  const value = createEmptyInput()
  value.document.rev = engine.rev()
  value.document.snapshot = engine.doc()
  value.editor.snapshot.state.edit = options.edit ?? null
  value.editor.snapshot.overlay.preview.draw = options.draw ?? null
  value.editor.snapshot.overlay.preview.edgeGuide = options.edgeGuide
  value.editor.snapshot.overlay.preview.selection.marquee = options.marquee
  value.editor.snapshot.overlay.preview.selection.guides = options.guides ?? []
  value.editor.snapshot.overlay.preview.mindmap = options.mindmapPreview ?? null
  value.editor.snapshot.state.selection = options.selection ?? {
    nodeIds: [],
    edgeIds: []
  }
  value.editor.snapshot.overlay.hover = options.hover ?? {
    kind: 'none'
  }
  value.editor.delta = options.delta ?? createEditorRuntimeDelta()
  value.document.delta = options.documentDelta ?? createMutationDelta()
  return value
}

const DOCUMENT_DELTA = createMutationDelta({
  reset: true
})

const GRAPH_DELTA = createEditorRuntimeDelta({
  graph: true
})

const IDLE_DELTA = createEditorRuntimeDelta()

const FULL_INPUT_DELTA = createEditorRuntimeDelta({
  graph: true,
  ui: true
})

const createNode = (input: {
  engine: ReturnType<typeof createEngine>
  position: { x: number; y: number }
  text: string
  size?: Size
  rotation?: number
}) => {
  const result = input.engine.execute({
    type: 'node.create',
    input: {
      type: 'text',
      position: input.position,
      size: input.size,
      rotation: input.rotation,
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

const insertEdgeLabel = (input: {
  engine: ReturnType<typeof createEngine>
  edgeId: EdgeId
  text: string
}) => {
  const result = input.engine.execute({
    type: 'edge.label.insert',
    edgeId: input.edgeId,
    label: {
      text: input.text
    }
  })

  expect(result.ok).toBe(true)
  if (!result.ok) {
    throw new Error('failed to insert edge label')
  }

  return result.data.labelId
}

const createMindmap = (
  engine: ReturnType<typeof createEngine>
) => {
  const result = engine.execute({
    type: 'mindmap.create',
    input: {
      template: mindmapApi.template.createBlank()
    }
  })

  expect(result.ok).toBe(true)
  if (!result.ok) {
    throw new Error('failed to create mindmap')
  }

  return result.data
}

const insertTopic = (input: {
  engine: ReturnType<typeof createEngine>
  mindmapId: string
  parentId: NodeId
  text: string
}) => {
  const result = input.engine.execute({
    type: 'mindmap.topic.insert',
    id: input.mindmapId,
    input: {
      kind: 'child',
      parentId: input.parentId,
      payload: {
        kind: 'text',
        text: input.text
      },
      options: {
        side: 'right'
      }
    }
  })

  expect(result.ok).toBe(true)
  if (!result.ok) {
    throw new Error('failed to insert mindmap topic')
  }

  return result.data.nodeId
}

describe('editor scene runtime', () => {
  it('projects committed document state into canonical scene state and notifies subscribers once', () => {
    const engine = createEngine({
      document: documentApi.create('doc_editor_scene_runtime'),
      layout
    })
    const nodeId = createNode({
      engine,
      position: { x: 10, y: 20 },
      text: 'node'
    })

    const runtime = createRuntime()
    const emissions: Result[] = []
    const unsubscribe = runtime.subscribe((result) => {
      emissions.push(result)
    })

    const result = runtime.update(createInput(engine, {
      documentDelta: DOCUMENT_DELTA
    }))
    const capture = runtime.capture()

    unsubscribe()

    expect(capture.graph.nodes.ids.length).toBe(1)
    expect(capture.items.ids.length).toBe(1)
    expect(capture.documentRevision).toBe(1)
    expect(runtime.scene.nodes.get(nodeId)).toBe(capture.graph.nodes.byId.get(nodeId))
    expect(capture.render.edge.statics.ids).toBeDefined()
    expect(result.trace?.phases.map((phase) => phase.name)).toEqual([
      'document',
      'graph',
      'spatial',
      'items',
      'ui',
      'render'
    ])
    expect(emissions).toEqual([result])
  })

  it('reuses canonical state when the input delta is idle', () => {
    const engine = createEngine({
      document: documentApi.create('doc_editor_scene_runtime_idle'),
      layout
    })
    const runtime = createRuntime()

    runtime.update(createInput(engine, {
      documentDelta: DOCUMENT_DELTA
    }))
    const baselineCapture = runtime.capture()
    const baselineRevision = runtime.revision()

    const idle = runtime.update(createInput(engine, {
      delta: IDLE_DELTA
    }))
    const idleCapture = runtime.capture()

    expect(idle.trace?.phases.map((phase) => phase.name)).toEqual([
      'document',
      'graph',
      'spatial',
      'items',
      'ui',
      'render'
    ])
    expect(idle.trace?.phases.every((phase) => phase.changed === false)).toBe(true)
    expect(idleCapture.documentRevision).toBe(baselineCapture.documentRevision)
    expect(idleCapture.graph.nodes.ids).toEqual(baselineCapture.graph.nodes.ids)
    expect(idleCapture.graph.edges.ids).toEqual(baselineCapture.graph.edges.ids)
    expect(idleCapture.items).toEqual(baselineCapture.items)
    expect(idleCapture.ui.chrome).toEqual(baselineCapture.ui.chrome)
    expect(runtime.revision()).toBeGreaterThan(baselineRevision)
  })

  it('exposes canonical read and harness surfaces for host adapters', () => {
    const engine = createEngine({
      document: documentApi.create('doc_editor_scene_runtime_public_api'),
      layout
    })
    const nodeId = createNode({
      engine,
      position: { x: 24, y: 48 },
      text: 'Public API'
    })
    const harness = createHarness()
    const result = harness.update(createInput(engine, {
      documentDelta: DOCUMENT_DELTA
    }))
    const capture = harness.capture()
    const scene = harness.scene

    expect(harness.runtime.capture()).toBe(capture)
    expect(harness.lastTrace()).toEqual(result.trace)
    expect(scene.nodes.get(nodeId)).toBe(capture.graph.nodes.byId.get(nodeId))
    expect(scene.spatial.get(`node:${nodeId}`)).toEqual(expect.objectContaining({
      key: `node:${nodeId}`,
      kind: 'node',
      item: {
        kind: 'node',
        id: nodeId
      }
    }))
    expect(scene.spatial.rect({
      x: -100,
      y: -100,
      width: 400,
      height: 400
    }).some((record) => record.key === `node:${nodeId}`)).toBe(true)
    const spatialRecord = scene.spatial.get(`node:${nodeId}`)!
    expect(scene.spatial.point({
      x: spatialRecord.bounds.x + spatialRecord.bounds.width / 2,
      y: spatialRecord.bounds.y + spatialRecord.bounds.height / 2
    }).some((record) => record.key === spatialRecord.key)).toBe(true)
    expect(scene.items()).toBe(capture.items)
    expect(harness.runtime.state().ui.chrome).toBe(capture.ui.chrome)
  })

  it('relayouts mindmap members while live text measurement changes', () => {
    const engine = createEngine({
      document: documentApi.create('doc_editor_scene_runtime_mindmap_root_width'),
      layout
    })
    const created = createMindmap(engine)
    const childId = insertTopic({
      engine,
      mindmapId: created.mindmapId,
      parentId: created.rootId,
      text: 'Child'
    })

    const runtime = createRuntime()

    runtime.update(
      createInput(engine, {
        documentDelta: DOCUMENT_DELTA,
        nodeMeasures: new Map([
          [created.rootId, { width: 160, height: 44 }],
          [childId, { width: 120, height: 44 }]
        ])
      })
    )
    const baselineCapture = runtime.capture()

    runtime.update(
      createInput(engine, {
        delta: GRAPH_DELTA,
        edit: {
          kind: 'node',
          nodeId: created.rootId,
          field: 'text',
          text: 'Central topic with much longer live width',
          composing: false,
          caret: {
            kind: 'end'
          }
        },
        nodeMeasures: new Map([
          [created.rootId, { width: 320, height: 44 }],
          [childId, { width: 120, height: 44 }]
        ])
      })
    )
    const liveCapture = runtime.capture()

    const baselineMindmap = baselineCapture.graph.owners.mindmaps.byId.get(created.mindmapId)
    const liveMindmap = liveCapture.graph.owners.mindmaps.byId.get(created.mindmapId)
    const liveRootUi = liveCapture.ui.nodes.byId.get(created.rootId)

    expect(baselineMindmap?.tree.layout).toBeDefined()
    expect(liveMindmap?.tree.layout).toBeDefined()
    expect(liveRootUi?.editing).toBe(true)
    expect(runtime.scene.nodes.get(childId)).toBe(liveCapture.graph.nodes.byId.get(childId))
  })

  it('builds renderer-ready edge, chrome, and spatial state in the render pipeline', () => {
    const engine = createEngine({
      document: documentApi.create('doc_editor_scene_runtime_render'),
      layout
    })
    const firstId = createNode({
      engine,
      position: { x: 40, y: 20 },
      text: 'First',
      size: { width: 140, height: 60 },
      rotation: 30
    })
    const secondId = createNode({
      engine,
      position: { x: 280, y: 40 },
      text: 'Second',
      size: { width: 160, height: 80 }
    })
    const offscreenId = createNode({
      engine,
      position: { x: 1200, y: 80 },
      text: 'Offscreen',
      size: { width: 120, height: 56 }
    })
    const edgeId = createEdge({
      engine,
      sourceId: firstId,
      targetId: secondId
    })
    const labelId = insertEdgeLabel({
      engine,
      edgeId,
      text: 'Committed label'
    })

    const runtime = createRuntime()
    runtime.update(
      createInput(engine, {
        delta: FULL_INPUT_DELTA,
        documentDelta: DOCUMENT_DELTA,
        edit: {
          kind: 'edge-label',
          edgeId,
          labelId,
          text: 'Edited label',
          composing: false,
          caret: {
            kind: 'end'
          }
        },
        nodeMeasures: new Map([
          [firstId, { width: 140, height: 60 }],
          [secondId, { width: 160, height: 80 }],
          [offscreenId, { width: 120, height: 56 }]
        ]),
        edgeLabelMeasures: new Map([
          [edgeId, new Map([
            [labelId, { width: 96, height: 24 }]
          ])]
        ]),
        selection: {
          nodeIds: [firstId, secondId],
          edgeIds: []
        },
        hover: {
          kind: 'edge',
          edgeId
        },
        guides: [{
          axis: 'x',
          value: 300,
          from: 10,
          to: 140,
          targetEdge: 'centerX',
          sourceEdge: 'centerX'
        }],
        edgeGuide: {
          path: {
            svgPath: 'M 0 0 L 40 20',
            style: {
              color: 'currentColor',
              width: 2
            }
          },
          connect: {
            focusedNodeId: secondId,
            resolution: {
              mode: 'free',
              pointWorld: {
                x: 320,
                y: 120
              }
            }
          }
        },
        marquee: {
          worldRect: {
            x: 0,
            y: 0,
            width: 520,
            height: 220
          },
          match: 'contain'
        },
        draw: {
          kind: 'pen',
          style: {
            kind: 'pen',
            color: 'currentColor',
            width: 2,
            opacity: 1
          },
          points: [
            { x: 12, y: 12 },
            { x: 24, y: 30 }
          ],
          bounds: {
            x: 12,
            y: 12,
            width: 12,
            height: 18
          },
          hiddenNodeIds: [firstId]
        },
      })
    )
    const capture = runtime.capture()

    const firstNode = capture.graph.nodes.byId.get(firstId)
    const edgeView = capture.graph.edges.byId.get(edgeId)
    const firstNodeUi = capture.ui.nodes.byId.get(firstId)
    const edgeUi = capture.ui.edges.byId.get(edgeId)
    const chrome = capture.ui.chrome
    const overlayKinds = chrome.overlays.map((overlay) => overlay.kind)

    expect(firstNode).toBeDefined()
    expect(firstNode!.geometry.rotation).toBe(30)
    expect(firstNode!.geometry.bounds.width).toBeGreaterThan(firstNode!.geometry.rect.width)
    expect(firstNode!.geometry.bounds.height).toBeGreaterThan(firstNode!.geometry.rect.height)
    expect(firstNodeUi?.selected).toBe(true)
    expect(firstNodeUi?.hovered).toBe(false)
    expect(firstNodeUi?.hidden).toBe(true)

    expect(edgeView).toBeDefined()
    expect(edgeView!.route.svgPath).toBeTruthy()
    expect(edgeView!.route.bounds).toBeDefined()
    expect(edgeView!.route.source).toBeDefined()
    expect(edgeView!.route.target).toBeDefined()
    expect(edgeView!.route.labels).toHaveLength(1)
    expect(edgeView!.route.labels[0]?.text).toBe('Edited label')
    expect(edgeView!.route.labels[0]?.point).toBeDefined()
    expect(edgeView!.route.labels[0]?.rect).toBeDefined()
    expect(edgeUi?.editingLabelId).toBe(labelId)
    expect(edgeUi?.labels.get(labelId)?.editing).toBe(true)

    expect(chrome.hover).toEqual({
      kind: 'edge',
      edgeId
    })
    expect(overlayKinds).toEqual(expect.arrayContaining([
      'hover',
      'selection',
      'guide',
      'marquee',
      'draw',
      'edit'
    ]))
    expect(chrome.preview.marquee?.worldRect).toEqual({
      x: 0,
      y: 0,
      width: 520,
      height: 220
    })
    expect(chrome.preview.edgeGuide).toEqual({
      path: {
        svgPath: 'M 0 0 L 40 20',
        style: {
          color: 'currentColor',
          width: 2
        }
      },
      connect: {
        focusedNodeId: secondId,
        resolution: {
          mode: 'free',
          pointWorld: {
            x: 320,
            y: 120
          }
        }
      }
    })
    expect(chrome.preview.guides).toHaveLength(1)
    expect(chrome.preview.draw?.hiddenNodeIds).toEqual([firstId])

    expect(capture.items.ids.map((key) => capture.items.byId.get(key)!)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'node', id: firstId }),
      expect.objectContaining({ kind: 'node', id: secondId }),
      expect.objectContaining({ kind: 'node', id: offscreenId }),
      expect.objectContaining({ kind: 'edge', id: edgeId })
    ]))
    expect(
      runtime.scene.spatial.rect({
        x: 0,
        y: 0,
        width: 700,
        height: 320
      }).map((record) => record.key)
    ).toEqual(expect.arrayContaining([
      `node:${firstId}`,
      `node:${secondId}`,
      `edge:${edgeId}`
    ]))
    expect(
      runtime.scene.spatial.rect({
        x: 0,
        y: 0,
        width: 700,
        height: 320
      }).some((record) => record.key === `node:${offscreenId}`)
    ).toBe(false)
  })

  it('derives viewport-backed screen projection and background view from scene.viewport', () => {
    const document = documentApi.create('doc_editor_scene_runtime_viewport')
    document.background = {
      type: 'dot',
      color: '#123456'
    }
    const engine = createEngine({
      document,
      layout
    })
    let sceneView = {
      zoom: 2,
      center: {
        x: 30,
        y: 20
      },
      worldRect: {
        x: 10,
        y: 5,
        width: 300,
        height: 200
      }
    }
    const runtime = createProjectionRuntime({
      layout,
      view: () => sceneView
    })

    runtime.update(createInput(engine, {
      documentDelta: DOCUMENT_DELTA
    }))

    expect(runtime.scene.viewport.screenPoint({
      x: 14,
      y: 9
    })).toEqual({
      x: 8,
      y: 8
    })
    expect(runtime.scene.viewport.screenRect({
      x: 14,
      y: 9,
      width: 6,
      height: 4
    })).toEqual({
      x: 8,
      y: 8,
      width: 12,
      height: 8
    })
    expect(runtime.scene.viewport.background()).toEqual({
      type: 'dot',
      color: '#123456',
      step: 48,
      offset: {
        x: 60,
        y: 40
      }
    })

    sceneView = {
      ...sceneView,
      zoom: 0.25
    }

    expect(runtime.scene.viewport.background()).toEqual({
      type: 'dot',
      color: '#123456',
      step: 24,
      offset: {
        x: 7.5,
        y: 5
      }
    })
  })
})
