import { describe, expect, it } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { createEngine } from '@whiteboard/engine'

describe('document engine snapshot', () => {
  it('publishes an initial committed snapshot with facts', () => {
    const doc = documentApi.create('doc_document_engine_snapshot')
    const engine = createEngine({
      document: doc
    })

    const publish = engine.current()
    const snapshot = publish.snapshot

    expect(snapshot.revision).toBe(0)
    expect(snapshot.state.root).toBe(doc)
    expect(snapshot.state.facts.entities.nodes.size).toBe(0)
    expect(snapshot.state.facts.entities.edges.size).toBe(0)
    expect(publish.change.root.doc).toBe(true)
    expect(publish.change.entities.nodes.added.size).toBe(0)
    expect(publish.change.relations.graph).toBe(true)
  })
})
