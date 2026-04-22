import { describe, expect, it } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { createEngine } from '@whiteboard/engine'

describe('document engine snapshot', () => {
  it('publishes an initial committed snapshot with facts', () => {
    const doc = documentApi.create('doc_document_engine_snapshot')
    const engine = createEngine({
      document: doc
    })

    const snapshot = engine.snapshot()

    expect(snapshot.revision).toBe(0)
    expect(snapshot.state.root).toBe(doc)
    expect(snapshot.state.facts.entities.nodes.size).toBe(0)
    expect(snapshot.state.facts.entities.edges.size).toBe(0)
    expect(snapshot.change.root.changed).toBe(true)
    expect(snapshot.change.entities.nodes.all.size).toBe(0)
    expect(snapshot.change.relations.graph.changed).toBe(true)
  })
})
