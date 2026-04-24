import { describe, expect, it } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { createEngine } from '@whiteboard/engine'

describe('document engine subscribe', () => {
  it('publishes exactly once after a successful commit', () => {
    const engine = createEngine({
      document: documentApi.create('doc_document_engine_subscribe')
    })

    let count = 0
    let revision = -1
    const unsubscribe = engine.subscribe((publish) => {
      count += 1
      revision = publish.rev
    })

    const result = engine.execute({
      type: 'node.create',
      input: {
        type: 'text',
        position: { x: 0, y: 0 },
        data: {
          text: 'hello'
        }
      }
    })

    unsubscribe()

    expect(result.ok).toBe(true)
    expect(count).toBe(1)
    expect(revision).toBe(1)
    expect(Object.keys(engine.current().snapshot.document.nodes)).toHaveLength(1)
  })

  it('increments revision monotonically across execute and apply', () => {
    const engine = createEngine({
      document: documentApi.create('doc_document_engine_revision')
    })

    const first = engine.execute({
      type: 'node.create',
      input: {
        id: 'node_1',
        type: 'text',
        position: { x: 0, y: 0 },
        data: {
          text: 'hello'
        }
      }
    })
    expect(first.ok).toBe(true)
    expect(engine.current().rev).toBe(1)

    const second = engine.apply([{
      type: 'node.field.set',
      id: 'node_1',
      field: 'rotation',
      value: 15
    }], {
      origin: 'remote'
    })

    expect(second.ok).toBe(true)
    expect(engine.current().rev).toBe(2)
    expect(engine.current().delta.nodes.updated.has('node_1')).toBe(true)
  })
})
