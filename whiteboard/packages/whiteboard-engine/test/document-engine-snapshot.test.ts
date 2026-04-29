import { describe, expect, it } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { createEngine } from '@whiteboard/engine'

describe('document engine snapshot', () => {
  it('publishes an initial committed document state', () => {
    const doc = documentApi.create('doc_document_engine_snapshot')
    const engine = createEngine({
      document: doc
    })

    const current = engine.current()

    expect(current.rev).toBe(0)
    expect(current.doc).toBe(doc)
  })
})
