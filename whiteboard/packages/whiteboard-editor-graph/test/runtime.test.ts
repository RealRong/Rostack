import {
  assertPhaseOrder,
  assertPublishedOnce
} from '@shared/projection-runtime'
import { describe, expect, it } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { createEngine } from '@whiteboard/engine'
import { createEditorGraphRuntime } from '../src'

const createInput = (engine: ReturnType<typeof createEngine>) => ({
  document: {
    snapshot: engine.snapshot()
  },
  session: {
    edit: null,
    draft: {
      nodes: new Map(),
      edges: new Map()
    },
    preview: {
      nodes: new Map(),
      edges: new Map(),
      draw: null,
      selection: {
        guides: []
      },
      mindmap: null
    },
    tool: {
      type: 'select' as const
    }
  },
  measure: {
    text: {
      ready: false,
      nodes: new Map(),
      edgeLabels: new Map()
    }
  },
  interaction: {
    selection: {
      nodeIds: [],
      edgeIds: []
    },
    hover: {
      kind: 'none' as const
    },
    drag: {
      kind: 'idle' as const
    }
  },
  viewport: {
    viewport: {
      center: { x: 0, y: 0 },
      zoom: 1
    }
  },
  clock: {
    now: 0
  }
})

const CHANGED = {
  document: { changed: true },
  session: { changed: false },
  measure: { changed: false },
  interaction: { changed: false },
  viewport: { changed: false },
  clock: { changed: false }
} as const

const IDLE = {
  document: { changed: false },
  session: { changed: false },
  measure: { changed: false },
  interaction: { changed: false },
  viewport: { changed: false },
  clock: { changed: false }
} as const

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

    const result = runtime.update(createInput(engine), CHANGED)
    unsubscribe()

    expect(result.snapshot.graph.nodes.ids.length).toBe(1)
    expect(result.snapshot.scene.items.length).toBe(1)
    expect(result.snapshot.base.documentRevision).toBe(1)
    expect(emissions).toHaveLength(1)

    assertPublishedOnce([result])
    expect(result.trace).toBeDefined()
    assertPhaseOrder(result.trace!, [
      'input',
      'graph',
      'measure',
      'structure',
      'tree',
      'element',
      'selection',
      'chrome',
      'scene'
    ])
  })

  it('publishes once and reuses working state when there is no new input change', () => {
    const engine = createEngine({
      document: documentApi.create('doc_editor_graph_runtime_idle')
    })
    const runtime = createEditorGraphRuntime()

    runtime.update(createInput(engine), CHANGED)
    const idle = runtime.update(createInput(engine), IDLE)

    expect(idle.trace).toBeDefined()
    expect(idle.trace!.phases).toHaveLength(0)
    expect(idle.change.graph.nodes.all.size).toBe(0)
    expect(idle.change.scene.changed).toBe(false)
    expect(idle.change.ui.selection.changed).toBe(false)
    expect(idle.change.ui.chrome.changed).toBe(false)
  })
})
