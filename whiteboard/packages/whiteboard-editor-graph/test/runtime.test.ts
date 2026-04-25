import {
  assertPhaseOrder,
  assertPublishedOnce
} from '@shared/projector/testing'
import { idDelta } from '@shared/projector/delta'
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
  createEditorGraphRuntime,
  type Input as EditorGraphInput
} from '../src'
import {
  createEditorGraphDelta,
  createEditorGraphTextMeasureEntry
} from '../src/testing/builders'
import {
  createEditorGraphHarness
} from '../src/testing/runtime'

type RuntimeInputOptions = {
  edit?: EditorGraphInput['session']['edit']
  nodeMeasures?: ReadonlyMap<NodeId, Size>
  edgeLabelMeasures?: ReadonlyMap<EdgeId, ReadonlyMap<string, Size>>
  selection?: EditorGraphInput['interaction']['selection']
  hover?: EditorGraphInput['interaction']['hover']
  draw?: EditorGraphInput['session']['preview']['draw']
  marquee?: EditorGraphInput['session']['preview']['selection']['marquee']
  guides?: readonly Guide[]
  mindmapPreview?: EditorGraphInput['session']['preview']['mindmap']
  now?: number
  delta?: EditorGraphInput['delta']
}

const createEditorGraphPublishSpec = () => ({
  graph: {
    read: (snapshot: ReturnType<ReturnType<typeof createEditorGraphHarness>['snapshot']>) => snapshot.graph,
    change: (change: ReturnType<ReturnType<typeof createEditorGraphHarness>['update']>['change']) => change.graph
  },
  items: {
    read: (snapshot: ReturnType<ReturnType<typeof createEditorGraphHarness>['snapshot']>) => snapshot.items,
    change: (change: ReturnType<ReturnType<typeof createEditorGraphHarness>['update']>['change']) => change.items
  },
  ui: {
    chrome: {
      read: (snapshot: ReturnType<ReturnType<typeof createEditorGraphHarness>['snapshot']>) => snapshot.ui.chrome,
      change: (change: ReturnType<ReturnType<typeof createEditorGraphHarness>['update']>['change']) => change.ui.chrome
    }
  }
})

const touchedIds = <TId extends string>(
  delta: {
    added: ReadonlySet<TId>
    updated: ReadonlySet<TId>
    removed: ReadonlySet<TId>
  }
): ReadonlySet<TId> => idDelta.touched(delta)

const createEdgeLabelMeasureEntries = (
  edgeLabelMeasures?: RuntimeInputOptions['edgeLabelMeasures']
) => new Map(
      [...(edgeLabelMeasures ?? new Map())].map(([edgeId, labels]) => [
        edgeId,
        new Map(
          [...labels].map(([labelId, size]) => [
            labelId,
            createEditorGraphTextMeasureEntry(size)
          ])
        )
      ])
)

const createInput = (
  engine: ReturnType<typeof createEngine>,
  options: RuntimeInputOptions = {}
): EditorGraphInput => ({
  document: {
    snapshot: engine.current().snapshot
  },
  session: {
    edit: options.edit ?? null,
    draft: {
      nodes: new Map(),
      edges: new Map()
    },
    preview: {
      nodes: new Map(),
      edges: new Map(),
      draw: options.draw ?? null,
      selection: {
        marquee: options.marquee,
        guides: options.guides ?? []
      },
      mindmap: options.mindmapPreview ?? null
    },
    tool: {
      type: 'select' as const
    }
  },
  measure: {
    text: {
      ready: (
        (options.nodeMeasures?.size ?? 0)
        + (options.edgeLabelMeasures?.size ?? 0)
      ) > 0,
      nodes: new Map(
        [...(options.nodeMeasures ?? new Map())].map(([nodeId, size]) => [
          nodeId,
          createEditorGraphTextMeasureEntry(size)
        ])
      ),
      edgeLabels: createEdgeLabelMeasureEntries(options.edgeLabelMeasures)
    }
  },
  interaction: {
    selection: options.selection ?? {
      nodeIds: [],
      edgeIds: []
    },
    hover: options.hover ?? {
      kind: 'none' as const
    },
    drag: {
      kind: 'idle' as const
    }
  },
  clock: {
    now: options.now ?? 0
  },
  delta: options.delta ?? createEditorGraphDelta()
})

const DOCUMENT_DELTA = createEditorGraphDelta({
  document: true
})

const GRAPH_DELTA = createEditorGraphDelta({
  graph: true
})

const IDLE_DELTA = createEditorGraphDelta()

const FULL_INPUT_DELTA = createEditorGraphDelta({
  document: true,
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

describe('editor graph runtime', () => {
  it('projects committed document snapshot into editor snapshot families via runtime shell', () => {
    const engine = createEngine({
      document: documentApi.create('doc_editor_graph_runtime')
    })
    engine.execute({
      type: 'node.create',
      input: {
        type: 'text',
        position: { x: 10, y: 20 },
        data: {
          text: 'node'
        }
      }
    })

    const runtime = createEditorGraphRuntime()
    const emissions: Array<{ snapshot: unknown; change: unknown }> = []
    const unsubscribe = runtime.subscribe((snapshot, change) => {
      emissions.push({
        snapshot,
        change
      })
    })

    const result = runtime.update(createInput(engine, {
      delta: DOCUMENT_DELTA
    }))
    unsubscribe()

    expect(result.snapshot.graph.nodes.ids.length).toBe(1)
    expect(result.snapshot.items.length).toBe(1)
    expect(result.snapshot.documentRevision).toBe(1)
    expect(emissions).toHaveLength(1)

    assertPublishedOnce([result])
    expect(result.trace).toBeDefined()
    assertPhaseOrder(result.trace!, [
      'graph',
      'spatial',
      'ui'
    ])
  })

  it('publishes once and reuses working state when there is no new input change', () => {
    const engine = createEngine({
      document: documentApi.create('doc_editor_graph_runtime_idle')
    })
    const runtime = createEditorGraphRuntime()

    runtime.update(createInput(engine, {
      delta: DOCUMENT_DELTA
    }))
    const idle = runtime.update(createInput(engine, {
      delta: IDLE_DELTA
    }))

    expect(idle.trace).toBeDefined()
    expect(idle.trace!.phases).toHaveLength(0)
    expect(touchedIds(idle.change.graph.nodes).size).toBe(0)
    expect(idle.change.items.changed).toBe(false)
    expect(idle.change.ui.chrome.changed).toBe(false)
  })

  it('exposes read facade, publish spec, and testing harness for host adapters', () => {
    const engine = createEngine({
      document: documentApi.create('doc_editor_graph_runtime_public_api')
    })
    const nodeId = createNode({
      engine,
      position: { x: 24, y: 48 },
      text: 'Public API'
    })
    const harness = createEditorGraphHarness()
    const result = harness.update(createInput(engine, {
      delta: DOCUMENT_DELTA
    }))
    const read = harness.read
    const publish = createEditorGraphPublishSpec()

    expect(harness.snapshot()).toBe(result.snapshot)
    expect(harness.runtime.snapshot()).toBe(result.snapshot)
    expect(harness.lastTrace()).toEqual(result.trace)
    expect(read.snapshot()).toBe(result.snapshot)
    expect(read.node(nodeId)).toBe(result.snapshot.graph.nodes.byId.get(nodeId))
    expect(read.spatial.get(`node:${nodeId}`)).toEqual(expect.objectContaining({
      key: `node:${nodeId}`,
      kind: 'node',
      item: {
        kind: 'node',
        id: nodeId
      }
    }))
    expect(read.spatial.rect({
      x: -100,
      y: -100,
      width: 400,
      height: 400
    }).some((record) => record.key === `node:${nodeId}`)).toBe(true)
    expect(read.spatial.all().some((record) => record.key === `node:${nodeId}`)).toBe(true)
    const spatialRecord = read.spatial.get(`node:${nodeId}`)!
    expect(read.spatial.point({
      x: spatialRecord.bounds.x + spatialRecord.bounds.width / 2,
      y: spatialRecord.bounds.y + spatialRecord.bounds.height / 2
    }).some((record) => record.key === spatialRecord.key)).toBe(true)
    expect(read.items()).toBe(result.snapshot.items)
    expect(read.ui()).toBe(result.snapshot.ui)
    expect(read.chrome()).toBe(result.snapshot.ui.chrome)
    expect(publish.graph.read(result.snapshot)).toBe(result.snapshot.graph)
    expect(publish.graph.change(result.change)).toBe(result.change.graph)
    expect(publish.items.read(result.snapshot)).toBe(result.snapshot.items)
    expect(publish.items.change(result.change)).toBe(result.change.items)
    expect(publish.ui.chrome.change(result.change)).toBe(result.change.ui.chrome)
  })

  it('relayouts mindmap children while root live width grows', () => {
    const engine = createEngine({
      document: documentApi.create('doc_editor_graph_runtime_mindmap_root_width')
    })
    const created = createMindmap(engine)
    const childId = insertTopic({
      engine,
      mindmapId: created.mindmapId,
      parentId: created.rootId,
      text: 'Child'
    })

    const runtime = createEditorGraphRuntime()
    const baseline = runtime.update(
      createInput(engine, {
        delta: DOCUMENT_DELTA,
        nodeMeasures: new Map([
          [created.rootId, { width: 160, height: 44 }],
          [childId, { width: 120, height: 44 }]
        ])
      }),
    )
    const live = runtime.update(
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

    const beforeRoot = baseline.snapshot.graph.nodes.byId.get(created.rootId)?.geometry.rect
    const beforeChild = baseline.snapshot.graph.nodes.byId.get(childId)?.geometry.rect
    const liveRootView = live.snapshot.graph.nodes.byId.get(created.rootId)
    const liveRootUi = live.snapshot.ui.nodes.byId.get(created.rootId)
    const liveRoot = live.snapshot.graph.nodes.byId.get(created.rootId)?.geometry.rect
    const liveChild = live.snapshot.graph.nodes.byId.get(childId)?.geometry.rect

    expect(beforeRoot).toBeDefined()
    expect(beforeChild).toBeDefined()
    expect(liveRootView).toBeDefined()
    expect(liveRoot).toBeDefined()
    expect(liveChild).toBeDefined()
    expect(liveRoot!.x).toBe(beforeRoot!.x)
    expect(liveRoot!.width).toBeGreaterThan(beforeRoot!.width)
    expect(liveChild!.x).toBeGreaterThan(beforeChild!.x)
    expect(liveRootView).toBeDefined()
    expect(liveRootUi?.editing).toBe(true)
    expect(liveRootUi?.edit?.field).toBe('text')
    expect(touchedIds(live.change.graph.nodes).has(childId)).toBe(true)
    expect(touchedIds(live.change.graph.owners.mindmaps).has(created.mindmapId)).toBe(true)
    expect(touchedIds(live.change.ui.nodes).has(created.rootId)).toBe(true)
  })

  it('relayouts sibling positions while topic live height grows', () => {
    const engine = createEngine({
      document: documentApi.create('doc_editor_graph_runtime_mindmap_topic_height')
    })
    const created = createMindmap(engine)
    const firstId = insertTopic({
      engine,
      mindmapId: created.mindmapId,
      parentId: created.rootId,
      text: 'First'
    })
    const secondId = insertTopic({
      engine,
      mindmapId: created.mindmapId,
      parentId: created.rootId,
      text: 'Second'
    })

    const runtime = createEditorGraphRuntime()
    const baseline = runtime.update(
      createInput(engine, {
        delta: DOCUMENT_DELTA,
        nodeMeasures: new Map([
          [created.rootId, { width: 160, height: 44 }],
          [firstId, { width: 120, height: 44 }],
          [secondId, { width: 120, height: 44 }]
        ])
      }),
    )
    const live = runtime.update(
      createInput(engine, {
        delta: GRAPH_DELTA,
        edit: {
          kind: 'node',
          nodeId: firstId,
          field: 'text',
          text: 'First branch now wraps into multiple visual lines',
          composing: false,
          caret: {
            kind: 'end'
          }
        },
        nodeMeasures: new Map([
          [created.rootId, { width: 160, height: 44 }],
          [firstId, { width: 120, height: 88 }],
          [secondId, { width: 120, height: 44 }]
        ])
      })
    )

    const beforeFirst = baseline.snapshot.graph.nodes.byId.get(firstId)?.geometry.rect
    const beforeSecond = baseline.snapshot.graph.nodes.byId.get(secondId)?.geometry.rect
    const liveFirst = live.snapshot.graph.nodes.byId.get(firstId)?.geometry.rect
    const liveSecond = live.snapshot.graph.nodes.byId.get(secondId)?.geometry.rect

    expect(beforeFirst).toBeDefined()
    expect(beforeSecond).toBeDefined()
    expect(liveFirst).toBeDefined()
    expect(liveSecond).toBeDefined()
    expect(liveFirst!.height).toBe(88)
    expect(liveFirst!.y).toBeLessThan(beforeFirst!.y)
    expect(liveSecond!.y).toBeGreaterThan(beforeSecond!.y)
    expect(touchedIds(live.change.graph.nodes).has(secondId)).toBe(true)
    expect(touchedIds(live.change.graph.owners.mindmaps).has(created.mindmapId)).toBe(true)
  })

  it('publishes renderer-ready element, chrome, and scene state', () => {
    const engine = createEngine({
      document: documentApi.create('doc_editor_graph_runtime_element_scene')
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

    const runtime = createEditorGraphRuntime()
    const result = runtime.update(
      createInput(engine, {
        delta: FULL_INPUT_DELTA,
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

    const firstNode = result.snapshot.graph.nodes.byId.get(firstId)
    const edgeView = result.snapshot.graph.edges.byId.get(edgeId)
    const firstNodeUi = result.snapshot.ui.nodes.byId.get(firstId)
    const edgeUi = result.snapshot.ui.edges.byId.get(edgeId)
    const chrome = result.snapshot.ui.chrome
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
    expect(chrome.preview.marquee?.match).toBe('contain')
    expect(chrome.preview.guides).toHaveLength(1)
    expect(chrome.preview.draw?.style).toEqual({
      kind: 'pen',
      color: 'currentColor',
      width: 2,
      opacity: 1
    })
    expect(chrome.preview.draw?.hiddenNodeIds).toEqual([firstId])
    expect(chrome.edit?.kind).toBe('edge-label')
    expect(chrome.edit?.labelId).toBe(labelId)

    expect(result.snapshot.items).toHaveLength(4)
    expect(result.snapshot.items).toEqual(expect.arrayContaining([
      { kind: 'node', id: firstId },
      { kind: 'node', id: secondId },
      { kind: 'node', id: offscreenId },
      { kind: 'edge', id: edgeId }
    ]))
    expect(
      runtime.query.spatial.rect({
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
      runtime.query.spatial.rect({
        x: 0,
        y: 0,
        width: 700,
        height: 320
      }).some((record) => record.key === `node:${offscreenId}`)
    ).toBe(false)
    expect(
      runtime.query.spatial.all({
        kinds: ['node']
      }).map((record) => record.item.id)
    ).toEqual(expect.arrayContaining([
      firstId,
      secondId,
      offscreenId
    ]))
    expect(result.change.items.changed).toBe(true)
    expect(result.change.ui.chrome.changed).toBe(true)
    expect(touchedIds(result.change.ui.nodes).has(firstId)).toBe(true)
    expect(touchedIds(result.change.ui.edges).has(edgeId)).toBe(true)
  })

  it('publishes mindmap connectors and mindmap preview chrome state', () => {
    const engine = createEngine({
      document: documentApi.create('doc_editor_graph_runtime_mindmap_preview')
    })
    const created = createMindmap(engine)
    const childId = insertTopic({
      engine,
      mindmapId: created.mindmapId,
      parentId: created.rootId,
      text: 'Child'
    })

    const runtime = createEditorGraphRuntime()
    const result = runtime.update(
      createInput(engine, {
        delta: FULL_INPUT_DELTA,
        nodeMeasures: new Map([
          [created.rootId, { width: 160, height: 44 }],
          [childId, { width: 120, height: 44 }]
        ]),
        hover: {
          kind: 'mindmap',
          mindmapId: created.mindmapId
        },
        mindmapPreview: {
          rootMove: {
            mindmapId: created.mindmapId,
            delta: {
              x: 40,
              y: 24
            }
          }
        },
      })
    )

    const mindmapView = result.snapshot.graph.owners.mindmaps.byId.get(created.mindmapId)
    const overlayKinds = result.snapshot.ui.chrome.overlays.map((overlay) => overlay.kind)

    expect(mindmapView).toBeDefined()
    expect(mindmapView!.tree.layout).toBeDefined()
    expect(mindmapView!.tree.bbox).toBeDefined()
    expect(mindmapView!.render.connectors.length).toBeGreaterThan(0)
    expect(result.snapshot.ui.chrome.hover).toEqual({
      kind: 'mindmap',
      mindmapId: created.mindmapId
    })
    expect(overlayKinds).toEqual(expect.arrayContaining([
      'hover',
      'mindmap-drop'
    ]))
    expect(result.snapshot.ui.chrome.preview.mindmap?.rootMove?.delta).toEqual({
      x: 40,
      y: 24
    })
    expect(result.snapshot.items).toContainEqual({
      kind: 'mindmap',
      id: created.mindmapId
    })
    expect(
      runtime.query.spatial.rect({
        x: -200,
        y: -200,
        width: 1200,
        height: 1200
      }, {
        kinds: ['mindmap']
      }).map((record) => record.item.id)
    ).toContain(created.mindmapId)
  })

  it('keeps top-level items separate from spatial queries over owned nodes', () => {
    const engine = createEngine({
      document: documentApi.create('doc_editor_graph_runtime_top_level_items')
    })
    const created = createMindmap(engine)
    const childId = insertTopic({
      engine,
      mindmapId: created.mindmapId,
      parentId: created.rootId,
      text: 'Child'
    })

    const runtime = createEditorGraphRuntime()
    const result = runtime.update(
      createInput(engine, {
        delta: FULL_INPUT_DELTA,
        nodeMeasures: new Map([
          [created.rootId, { width: 160, height: 44 }],
          [childId, { width: 120, height: 44 }]
        ])
      })
    )

    expect(result.snapshot.items).toEqual([
      {
        kind: 'mindmap',
        id: created.mindmapId
      }
    ])
    expect(
      runtime.query.spatial.rect({
        x: -200,
        y: -200,
        width: 1200,
        height: 1200
      }, {
        kinds: ['mindmap']
      }).map((record) => record.item)
    ).toEqual([
      {
        kind: 'mindmap',
        id: created.mindmapId
      }
    ])
    expect(
      runtime.query.spatial.rect({
        x: -200,
        y: -200,
        width: 1200,
        height: 1200
      }, {
        kinds: ['node']
      }).map((record) => record.item.id)
    ).toEqual(expect.arrayContaining([
      created.rootId,
      childId
    ]))
  })
})
