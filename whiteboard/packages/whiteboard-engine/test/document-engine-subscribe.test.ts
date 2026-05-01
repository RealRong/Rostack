import { describe, expect, it } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { createEngine } from '@whiteboard/engine'
import { createTestLayout } from './support'

describe('document engine subscribe', () => {
  it('publishes exactly once after a successful commit', () => {
    const engine = createEngine({
      document: documentApi.create('doc_document_engine_subscribe'),
      layout: createTestLayout()
    })

    let count = 0
    let revision = -1
    const unsubscribe = engine.subscribe((current) => {
      count += 1
      revision = current.rev
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
    expect(Object.keys(engine.doc().nodes)).toHaveLength(1)
  })

  it('increments revision monotonically across execute calls', () => {
    const engine = createEngine({
      document: documentApi.create('doc_document_engine_revision'),
      layout: createTestLayout()
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
    expect(engine.rev()).toBe(1)

    const second = engine.execute({
      type: 'node.update',
      updates: [{
        id: 'node_1',
        input: {
          fields: {
            rotation: 15
          }
        }
      }]
    }, {
      origin: 'remote'
    })

    expect(second.ok).toBe(true)
    expect(engine.rev()).toBe(2)
    if (!second.ok) {
      return
    }
    expect(second.commit.delta.changes['node.geometry']?.ids).toContain('node_1')
  })
})
