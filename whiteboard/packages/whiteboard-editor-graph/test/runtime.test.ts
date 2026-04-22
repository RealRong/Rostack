import { describe, expect, it } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { createDocumentEngine } from '@whiteboard/engine'
import { createEditorGraphRuntime } from '../src'

describe('editor graph runtime', () => {
  it('projects committed document snapshot into editor snapshot families', () => {
    const engine = createDocumentEngine({
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
    const result = runtime.update({
      document: {
        snapshot: engine.snapshot()
      },
      session: {},
      measure: {},
      interaction: {
        selection: {
          nodeIds: [],
          edgeIds: []
        }
      },
      viewport: {},
      clock: {}
    }, {
      document: { changed: true },
      session: { changed: false },
      measure: { changed: false },
      interaction: { changed: false },
      viewport: { changed: false },
      clock: { changed: false }
    })

    expect(result.snapshot.graph.nodes.ids.length).toBe(1)
    expect(result.snapshot.scene.items.length).toBe(1)
    expect(result.snapshot.base.documentRevision).toBe(1)
  })
})
