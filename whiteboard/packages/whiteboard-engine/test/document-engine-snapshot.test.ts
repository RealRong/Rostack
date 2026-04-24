import { describe, expect, it } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { createEngine } from '@whiteboard/engine'

describe('document engine snapshot', () => {
  it('publishes an initial committed snapshot with delta', () => {
    const doc = documentApi.create('doc_document_engine_snapshot')
    const engine = createEngine({
      document: doc
    })

    const publish = engine.current()
    const snapshot = publish.snapshot

    expect(snapshot.revision).toBe(0)
    expect(snapshot.document).toBe(doc)
    expect(publish.delta.reset).toBe(true)
    expect(publish.delta.background).toBe(true)
    expect(publish.delta.order).toBe(true)
    expect(publish.delta.nodes.added.size).toBe(0)
    expect(publish.delta.edges.added.size).toBe(0)
  })
})
