import { describe, expect, it } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { createEngine } from '@whiteboard/engine'
import { createTestLayout } from './support'

describe('document engine snapshot', () => {
  it('publishes an initial committed document state', () => {
    const doc = documentApi.create('doc_document_engine_snapshot')
    const engine = createEngine({
      document: doc,
      layout: createTestLayout()
    })

    expect(engine.rev()).toBe(0)
    expect(engine.doc()).toBe(doc)
  })
})
